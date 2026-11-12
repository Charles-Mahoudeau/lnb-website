import { isDeepStrictEqual } from 'node:util';

import { and, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  anticheatFile,
  anticheatReport,
  anticheatReportFile,
  anticheatUsage,
  wardenSession,
} from '~~/server/db/schema';
import type { AnticheatDeclared } from '~~/server/db/schema';
import { wardenAuditService } from '~~/server/services/warden/audit';

import { anticheatAlertService } from './alerts';
import { anticheatLookupService } from './lookup';
import { anticheatPlayerService } from './players';
import { bandOf, effectiveScore, fileAction, actionRank, playerBandOf, verdictOf } from './rules';
import type { VerdictFile } from './rules';
import { anticheatScoringService } from './scoring';
import { anticheatSettingsService } from './settings';
import { refuse } from './shared';
import type { Tx } from './shared';

import type {
  AnticheatAction,
  AnticheatFacts,
  AnticheatReportBody,
  AnticheatReportFileInput,
  AnticheatReportFileResult,
  AnticheatReportResponse,
  AnticheatVerdict,
} from '#shared/schemas/anticheat';
import { fileStatus } from '#shared/utils/anticheat';

// Takes the file reports of the Minecraft server, keeps the usage links, and works out the verdict.
// See docs/anticheat.md.

function declaredOf(file: AnticheatReportFileInput): AnticheatDeclared {
  const declared: AnticheatDeclared = {};
  if (file.modId) declared.modId = file.modId;
  if (file.name) declared.name = file.name;
  if (file.version) declared.version = file.version;
  if (file.loader) declared.loader = file.loader;
  return declared;
}

function sameFacts(a: AnticheatFacts, b: AnticheatFacts): boolean {
  return a.coreShaders === b.coreShaders && a.alteredTextures === b.alteredTextures;
}

/** What the server is told when the mode is off: nothing is stored. */
function offAnswer(): AnticheatReportResponse {
  return {
    reportId: null,
    mode: 'off',
    verdict: { action: 'allow', reasons: [] },
    files: [],
    pending: 0,
  };
}

/**
 * Takes a report for an open session. The account comes from the session, never from the payload.
 * Files are stored by hash, scored when they can be, and linked to the player. Unknown hashes wait
 * for their platform lookup and are scored as soon as it ends.
 */
async function submit(body: AnticheatReportBody): Promise<AnticheatReportResponse> {
  const config = await anticheatSettingsService.get();
  const result = await db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        id: wardenSession.id,
        userId: wardenSession.userId,
        minecraftUuid: wardenSession.minecraftUuid,
      })
      .from(wardenSession)
      .where(and(eq(wardenSession.id, body.sessionId), isNull(wardenSession.endedAt)));
    if (!session) refuse(404, 'unknownSession');
    if (config.mode === 'off') return { answer: offAnswer(), pending: false };

    // A fixed order keeps two reports that share files from waiting on each other.
    const reported = [...body.files].sort((a, b) => (a.sha512 < b.sha512 ? -1 : 1));
    const player = await anticheatPlayerService.ensure(tx, session.userId);
    const rescore = await storeFiles(tx, reported, session.userId, config.rulesVersion);

    const ctx = await anticheatScoringService.context(tx);
    await anticheatScoringService.scoreFiles(tx, rescore, ctx);

    const [previous] = await tx
      .select({ last: max(anticheatReport.seq) })
      .from(anticheatReport)
      .where(eq(anticheatReport.sessionId, session.id));
    const [report] = await tx
      .insert(anticheatReport)
      .values({
        sessionId: session.id,
        userId: session.userId,
        minecraftUuid: session.minecraftUuid,
        seq: (previous?.last ?? 0) + 1,
        mode: config.mode,
        rulesVersion: config.rulesVersion,
        verdict: { action: 'allow', reasons: [] },
        playerScore: player.score,
      })
      .returning({ id: anticheatReport.id });
    const stored = await tx
      .select({ sha512: anticheatFile.sha512, kind: anticheatFile.kind })
      .from(anticheatFile)
      .where(
        inArray(
          anticheatFile.sha512,
          reported.map((file) => file.sha512),
        ),
      );
    const kinds = new Map(stored.map((row) => [row.sha512, row.kind]));
    await tx.insert(anticheatReportFile).values(
      reported.map((file) => ({
        reportId: report!.id,
        sha512: file.sha512,
        kind: kinds.get(file.sha512) ?? file.kind,
        filename: file.filename,
        declared: declaredOf(file),
      })),
    );
    await linkUsage(tx, session, reported);

    await evaluate(tx, report!.id);
    const answer = await buildResponse(tx, report!.id);
    return { answer, pending: answer.pending > 0 };
  });
  // After the commit, so the lookup sees the files.
  if (result.pending) anticheatLookupService.kick();
  return result.answer;
}

/**
 * Inserts the new files and notes the known ones as seen. Resource pack facts are stored the first
 * time; a report that disagrees with the stored facts marks them disputed and raises an alert.
 * Returns the files to score: the new ones, those without a score, those scored under older rules
 * and those whose facts changed.
 */
async function storeFiles(
  tx: Tx,
  reported: AnticheatReportFileInput[],
  userId: string,
  rulesVersion: number,
): Promise<string[]> {
  const hashes = reported.map((file) => file.sha512);
  const existing = new Map(
    (
      await tx
        .select()
        .from(anticheatFile)
        .where(inArray(anticheatFile.sha512, hashes))
        .orderBy(anticheatFile.sha512)
        .for('update')
    ).map((row) => [row.sha512, row]),
  );

  const toScore = new Set<string>();
  const fresh = reported.filter((file) => !existing.has(file.sha512));
  if (fresh.length > 0) {
    await tx
      .insert(anticheatFile)
      .values(
        fresh.map((file) => ({
          sha512: file.sha512,
          kind: file.kind,
          fingerprint: file.fingerprint ?? null,
          filename: file.filename,
          declared: declaredOf(file),
          lookupState: file.kind === 'client' ? ('skipped' as const) : ('pending' as const),
          facts: file.kind === 'resourcepack' ? (file.facts ?? null) : null,
        })),
      )
      .onConflictDoNothing();
    for (const file of fresh) toScore.add(file.sha512);
  }

  const known = reported.filter((file) => existing.has(file.sha512));
  if (known.length > 0) {
    await tx
      .update(anticheatFile)
      .set({ lastSeenAt: new Date() })
      .where(
        inArray(
          anticheatFile.sha512,
          known.map((file) => file.sha512),
        ),
      );
  }
  for (const file of known) {
    const row = existing.get(file.sha512)!;
    if (row.kind === 'client') continue;
    if (row.score === null || row.rulesVersion !== rulesVersion) toScore.add(file.sha512);
    if (file.fingerprint !== undefined && row.fingerprint === null) {
      await tx
        .update(anticheatFile)
        .set({ fingerprint: file.fingerprint })
        .where(eq(anticheatFile.sha512, file.sha512));
    }
    if (row.kind !== 'resourcepack' || !file.facts) continue;
    if (!row.facts) {
      await tx
        .update(anticheatFile)
        .set({ facts: file.facts })
        .where(eq(anticheatFile.sha512, file.sha512));
      toScore.add(file.sha512);
    } else if (!row.factsDisputed && !sameFacts(row.facts, file.facts)) {
      await tx
        .update(anticheatFile)
        .set({ factsDisputed: true })
        .where(eq(anticheatFile.sha512, file.sha512));
      await anticheatAlertService.raise(tx, {
        kind: 'factsDisputed',
        userId,
        sha512: file.sha512,
        name: file.name ?? file.filename,
        data: { stored: row.facts, reported: file.facts },
      });
      toScore.add(file.sha512);
    }
  }
  return [...toScore];
}

/** One link per player and file. A session counts once, however many reports it sends. */
async function linkUsage(
  tx: Tx,
  session: { id: string; userId: string; minecraftUuid: string },
  reported: AnticheatReportFileInput[],
): Promise<void> {
  await tx
    .insert(anticheatUsage)
    .values(
      reported.map((file) => ({
        userId: session.userId,
        sha512: file.sha512,
        lastSessionId: session.id,
        lastVersion: file.version ?? null,
        lastMinecraftUuid: session.minecraftUuid,
      })),
    )
    .onConflictDoUpdate({
      target: [anticheatUsage.userId, anticheatUsage.sha512],
      set: {
        lastSeenAt: new Date(),
        sessionCount: sql`case when ${anticheatUsage.lastSessionId} is distinct from ${session.id}::uuid then ${anticheatUsage.sessionCount} + 1 else ${anticheatUsage.sessionCount} end`,
        lastSessionId: session.id,
        lastVersion: sql`coalesce(excluded.last_version, ${anticheatUsage.lastVersion})`,
        lastMinecraftUuid: session.minecraftUuid,
      },
    });
}

export interface Evaluation {
  /** The verdict or a file's entry differs from what the report held. */
  changed: boolean;
  /** The files whose score, band or action differs from what the report held. */
  changedFiles: string[];
  verdict: AnticheatVerdict;
}

/**
 * Works the verdict out again from the current file rows and the player's score, and stores the
 * snapshot on the report. Raises the alerts the verdict calls for.
 */
async function evaluate(tx: Tx, reportId: string): Promise<Evaluation> {
  const { mode, rules, rulesVersion } = await anticheatSettingsService.get();
  const [report] = await tx.select().from(anticheatReport).where(eq(anticheatReport.id, reportId));
  if (!report) throw new Error(`Unknown anticheat report ${reportId}`);
  if (mode === 'off') return { changed: false, changedFiles: [], verdict: report.verdict };

  const player = await anticheatPlayerService.get(tx, report.userId);
  const rows = await tx
    .select({ entry: anticheatReportFile, file: anticheatFile })
    .from(anticheatReportFile)
    .innerJoin(anticheatFile, eq(anticheatFile.sha512, anticheatReportFile.sha512))
    .where(eq(anticheatReportFile.reportId, reportId));

  let changed = false;
  const changedFiles: string[] = [];
  const verdictFiles: VerdictFile[] = [];
  for (const { entry, file } of rows) {
    const name = entry.declared.name ?? entry.filename;
    let effective: number | null = null;
    let band = null;
    let action: AnticheatAction | null = null;
    if (entry.kind === 'client') {
      action = 'allow';
    } else if (file.score !== null) {
      // Trust never lifts a mod found on neither platform.
      const unknownMod =
        entry.kind === 'mod' &&
        !file.platformVersion?.modrinth &&
        !file.platformVersion?.curseforge;
      effective = effectiveScore(file.score, player.score, rules, unknownMod);
      band = bandOf(effective, rules);
      action = fileAction(entry.kind, band, rules);
    }
    verdictFiles.push({
      sha512: entry.sha512,
      name,
      kind: entry.kind,
      band,
      action: action ?? 'allow',
    });
    if (
      entry.score !== file.score ||
      entry.effectiveScore !== effective ||
      entry.band !== band ||
      entry.action !== action
    ) {
      changed = true;
      changedFiles.push(entry.sha512);
      await tx
        .update(anticheatReportFile)
        .set({ score: file.score, effectiveScore: effective, band, action })
        .where(
          and(
            eq(anticheatReportFile.reportId, reportId),
            eq(anticheatReportFile.sha512, entry.sha512),
          ),
        );
    }

    if (action === 'refuse') {
      await anticheatAlertService.raise(tx, {
        kind: 'fileRefused',
        userId: report.userId,
        sha512: entry.sha512,
        minecraftUuid: report.minecraftUuid,
        name,
        data: { name },
      });
    } else if (action === 'kick' || action === 'ban') {
      await anticheatAlertService.raise(tx, {
        kind: 'bannedFileSeen',
        userId: report.userId,
        sha512: entry.sha512,
        minecraftUuid: report.minecraftUuid,
        name,
        data: { name },
      });
    }
  }

  if (playerBandOf(player.score, rules) === 'held') {
    await anticheatAlertService.raise(tx, {
      kind: 'playerHeld',
      userId: report.userId,
      minecraftUuid: report.minecraftUuid,
      data: { score: player.score },
    });
  }

  const verdict = verdictOf(verdictFiles, player, mode, rules);
  // jsonb keeps keys in its own order, so the objects are compared, not their text.
  if (!isDeepStrictEqual(verdict, report.verdict)) changed = true;
  await tx
    .update(anticheatReport)
    .set({ verdict, playerScore: player.score, mode, rulesVersion, evaluatedAt: new Date() })
    .where(eq(anticheatReport.id, reportId));
  return { changed, changedFiles, verdict };
}

/** A report as the server receives it, rebuilt from the stored snapshot. */
async function buildResponse(
  tx: Tx | typeof db,
  reportId: string,
): Promise<AnticheatReportResponse> {
  const { rules } = await anticheatSettingsService.get();
  const [report] = await tx.select().from(anticheatReport).where(eq(anticheatReport.id, reportId));
  if (!report) throw new Error(`Unknown anticheat report ${reportId}`);
  const rows = await tx
    .select({ entry: anticheatReportFile, file: anticheatFile })
    .from(anticheatReportFile)
    .innerJoin(anticheatFile, eq(anticheatFile.sha512, anticheatReportFile.sha512))
    .where(eq(anticheatReportFile.reportId, reportId));

  const files: AnticheatReportFileResult[] = rows
    .map(({ entry, file }) => ({
      sha512: entry.sha512,
      kind: entry.kind,
      name: entry.declared.name ?? entry.filename,
      state:
        entry.kind === 'client'
          ? ('ignored' as const)
          : entry.score === null
            ? ('pending' as const)
            : ('scored' as const),
      score: entry.score,
      effectiveScore: entry.effectiveScore,
      band: entry.band,
      status: fileStatus({
        kind: entry.kind,
        score: file.score,
        band: file.band,
        reviewedBand: file.reviewedBand,
      }),
      action: entry.action ?? 'allow',
    }))
    // The files that matter first.
    .sort(
      (a, b) =>
        actionRank(b.action) - actionRank(a.action) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );

  return {
    reportId: report.id,
    mode: report.mode,
    verdict: report.verdict,
    player: { score: report.playerScore, band: playerBandOf(report.playerScore, rules) },
    files,
    pending: files.filter((file) => file.state === 'pending').length,
    pendingTimeoutSeconds: rules.lookup.pendingTimeoutSeconds,
  };
}

/** The latest report of a session, for a server that missed a stream event. */
async function current(sessionId: string): Promise<AnticheatReportResponse> {
  const [session] = await db
    .select({ id: wardenSession.id })
    .from(wardenSession)
    .where(eq(wardenSession.id, sessionId));
  if (!session) refuse(404, 'unknownSession');
  const [report] = await db
    .select({ id: anticheatReport.id })
    .from(anticheatReport)
    .where(eq(anticheatReport.sessionId, sessionId))
    .orderBy(desc(anticheatReport.seq))
    .limit(1);
  if (!report) refuse(404, 'noReport');
  return buildResponse(db, report.id);
}

/**
 * Evaluates the given reports again and tells the Minecraft server about each verdict that changed,
 * through an `anticheat.verdict` audit row. One transaction per report, so one failure leaves the
 * others. Returns how many verdicts changed.
 */
async function reevaluate(reportIds: string[]): Promise<number> {
  let changed = 0;
  for (const reportId of reportIds) {
    try {
      await db.transaction(async (tx) => {
        const result = await evaluate(tx, reportId);
        if (!result.changed) return;
        const response = await buildResponse(tx, reportId);
        const [report] = await tx
          .select()
          .from(anticheatReport)
          .where(eq(anticheatReport.id, reportId));
        await wardenAuditService.record(tx, {
          action: 'anticheat.verdict',
          actor: { source: 'system' },
          targetUserId: report!.userId,
          targetMinecraftUuid: report!.minecraftUuid,
          data: {
            sessionId: report!.sessionId,
            uuid: report!.minecraftUuid,
            reportId,
            verdict: result.verdict,
            files: response.files.filter((file) => result.changedFiles.includes(file.sha512)),
          },
        });
        changed++;
      });
    } catch (error) {
      console.error('Anticheat: re-evaluation failed', error);
    }
  }
  return changed;
}

/** The latest report of each open session, when it contains one of the files. */
async function reevaluateFor(sha512s: string[]): Promise<number> {
  if (sha512s.length === 0) return 0;
  const { rows } = await db.execute<{ id: string }>(sql`
    select r.id from ${anticheatReport} r
    join ${wardenSession} s on s.id = r.session_id and s.ended_at is null
    where r.seq = (select max(seq) from ${anticheatReport} where session_id = r.session_id)
      and exists (
        select 1 from ${anticheatReportFile} f
        where f.report_id = r.id and f.sha512 = any(${sql.param(sha512s)}::text[])
      )`);
  return reevaluate(rows.map((row) => row.id));
}

export const anticheatReportService = { submit, evaluate, current, reevaluate, reevaluateFor };
