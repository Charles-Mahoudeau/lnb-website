import { and, eq, inArray, isNotNull, isNull, lt, notExists, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  anticheatAlert,
  anticheatFile,
  anticheatProject,
  anticheatReport,
  anticheatUsage,
} from '~~/server/db/schema';

import { CatalogUnavailableError, platformProject } from './platforms';
import { anticheatReportService } from './reports';
import { anticheatScoringService } from './scoring';
import { anticheatSettingsService } from './settings';

// What the nightly anticheat jobs do. See docs/anticheat.md.

/** Reports, usage rows and unused files are kept this long after they were last seen. */
export const ANTICHEAT_RETENTION_MONTHS = 12;
/** Dismissed alerts are kept this many days. */
export const ANTICHEAT_ALERT_RETENTION_DAYS = 90;
/** The re-score job stops after this long and leaves the rest for the next night. */
export const ANTICHEAT_RESCORE_BUDGET_MS = 5 * 60 * 1000;
const RESCORE_BATCH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

function monthsAgo(months: number, now: Date): Date {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

/**
 * Fetches again the platform data of projects not fetched for `rescoreDays`, so downloads and
 * moderation status don't stay as they were at the first lookup. A platform that can't be
 * reached leaves the stored data as it is: the files are still scored from it.
 */
async function refreshProjects(
  projectIds: string[],
  options: { now: Date; deadline: number },
): Promise<void> {
  if (projectIds.length === 0) return;
  const { rules } = await anticheatSettingsService.get();
  const cutoff = options.now.getTime() - rules.lookup.rescoreDays * DAY_MS;
  const projects = await db
    .select()
    .from(anticheatProject)
    .where(inArray(anticheatProject.id, projectIds));
  const old = (fetchedAt: string | undefined) => fetchedAt && Date.parse(fetchedAt) < cutoff;
  for (const project of projects) {
    for (const source of ['modrinth', 'curseforge'] as const) {
      const id = source === 'modrinth' ? project.modrinthId : project.curseforgeId;
      if (!id || !old(project[source]?.fetchedAt)) continue;
      if (Date.now() >= options.deadline) return;
      try {
        const fresh = await platformProject(source, id);
        // A project the platform no longer knows keeps its last data.
        if (!fresh) continue;
        await db
          .update(anticheatProject)
          .set(
            source === 'modrinth' && 'modrinth' in fresh
              ? { modrinth: fresh.modrinth }
              : 'curseforge' in fresh
                ? { curseforge: fresh.curseforge }
                : {},
          )
          .where(eq(anticheatProject.id, project.id));
      } catch (error) {
        if (!(error instanceof CatalogUnavailableError))
          console.error('Anticheat: refreshing a project failed', error);
      }
    }
  }
}

export interface RescoreStaleResult {
  /** Files scored again. */
  files: number;
  /** Files whose score, band or path changed. */
  changed: number;
  /** True when the time ran out before every stale file was done. */
  incomplete: boolean;
}

/**
 * Scores again the files whose re-score time has come, in batches, until none are left or the
 * budget is spent. A file still waiting for its lookup has no score and is left to the lookup.
 * Verdicts are worked out again for the files that changed.
 */
async function rescoreStale(
  options: { now?: Date; budgetMs?: number; batchSize?: number } = {},
): Promise<RescoreStaleResult> {
  const startedAt = options.now ?? new Date();
  const budgetMs = options.budgetMs ?? ANTICHEAT_RESCORE_BUDGET_MS;
  const batchSize = options.batchSize ?? RESCORE_BATCH;
  const clock = Date.now();
  const result: RescoreStaleResult = { files: 0, changed: 0, incomplete: false };

  for (;;) {
    if (Date.now() - clock >= budgetMs) {
      result.incomplete = true;
      return result;
    }
    // Scoring moves `rescoreAt` into the future, so a scored file is not picked twice.
    const stale = await db
      .select({ sha512: anticheatFile.sha512, projectId: anticheatFile.projectId })
      .from(anticheatFile)
      .where(
        and(
          lt(anticheatFile.rescoreAt, startedAt),
          isNotNull(anticheatFile.score),
          sql`${anticheatFile.kind} <> 'client'`,
        ),
      )
      .orderBy(anticheatFile.rescoreAt)
      .limit(batchSize);
    if (stale.length === 0) return result;
    await refreshProjects([...new Set(stale.flatMap((row) => row.projectId ?? []))], {
      now: startedAt,
      deadline: clock + budgetMs,
    });
    const changed = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ sha512: anticheatFile.sha512 })
        .from(anticheatFile)
        .where(
          and(
            inArray(
              anticheatFile.sha512,
              stale.map((row) => row.sha512),
            ),
            lt(anticheatFile.rescoreAt, startedAt),
          ),
        )
        .orderBy(anticheatFile.sha512)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return { count: 0, changed: [] as string[] };
      const results = await anticheatScoringService.scoreFiles(
        tx,
        rows.map((row) => row.sha512),
      );
      return { count: rows.length, changed: results.filter((r) => r.changed).map((r) => r.sha512) };
    });
    result.files += changed.count;
    result.changed += changed.changed.length;
    if (changed.changed.length > 0) {
      try {
        await anticheatReportService.reevaluateFor(changed.changed);
      } catch (error) {
        console.error('Anticheat: evaluation after a re-score failed', error);
      }
    }
  }
}

export interface PruneResult {
  reports: number;
  usage: number;
  alerts: number;
  files: number;
}

/** Deletes old reports, usage, dismissed alerts and files nobody uses. */
async function prune(now = new Date()): Promise<PruneResult> {
  const cutoff = monthsAgo(ANTICHEAT_RETENTION_MONTHS, now);
  const alertCutoff = new Date(now.getTime() - ANTICHEAT_ALERT_RETENTION_DAYS * DAY_MS);

  const reports = await db
    .delete(anticheatReport)
    .where(lt(anticheatReport.createdAt, cutoff))
    .returning({ id: anticheatReport.id });

  // Usage of a banned file, or of a file of a banned project, is kept: it shows who used it.
  const bannedFiles = db
    .select({ sha512: anticheatFile.sha512 })
    .from(anticheatFile)
    .leftJoin(anticheatProject, eq(anticheatProject.id, anticheatFile.projectId))
    .where(sql`${anticheatFile.decision} = 'banned' or ${anticheatProject.decision} = 'banned'`);
  const usage = await db
    .delete(anticheatUsage)
    .where(
      and(
        lt(anticheatUsage.lastSeenAt, cutoff),
        sql`${anticheatUsage.sha512} not in (${bannedFiles})`,
      ),
    )
    .returning({ userId: anticheatUsage.userId });

  const alerts = await db
    .delete(anticheatAlert)
    .where(and(isNotNull(anticheatAlert.dismissedAt), lt(anticheatAlert.dismissedAt, alertCutoff)))
    .returning({ id: anticheatAlert.id });

  const files = await db
    .delete(anticheatFile)
    .where(
      and(
        lt(anticheatFile.lastSeenAt, cutoff),
        isNull(anticheatFile.decision),
        notExists(
          db
            .select({ one: sql`1` })
            .from(anticheatUsage)
            .where(eq(anticheatUsage.sha512, anticheatFile.sha512)),
        ),
      ),
    )
    .returning({ sha512: anticheatFile.sha512 });

  return {
    reports: reports.length,
    usage: usage.length,
    alerts: alerts.length,
    files: files.length,
  };
}

export const anticheatMaintenanceService = { rescoreStale, prune };
