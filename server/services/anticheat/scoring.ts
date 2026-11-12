import { eq, inArray, sql } from 'drizzle-orm';

import {
  anticheatFile,
  anticheatHistory,
  anticheatModIdBan,
  anticheatProject,
} from '~~/server/db/schema';
import { modsEnv } from '~~/server/lib/mods-env';

import { anticheatModpackService } from './modpack';
import type { Modpack } from './modpack';
import { scoreFile } from './rules';
import { anticheatSettingsService } from './settings';
import type { Tx } from './shared';

import type {
  AnticheatBreakdown,
  AnticheatFileBand,
  AnticheatRules,
} from '#shared/schemas/anticheat';

// Scores files from the database and stores the breakdown the admin shows. See docs/anticheat.md.

const DAY_MS = 24 * 60 * 60 * 1000;

/** What scoring needs besides the file, loaded once for many files. */
export interface ScoringContext {
  rules: AnticheatRules;
  rulesVersion: number;
  modpack: Modpack;
  curseforgeConfigured: boolean;
}

export interface ScoreResult {
  sha512: string;
  score: number | null;
  band: AnticheatFileBand | null;
  path: AnticheatBreakdown['path'];
  /** The score, the band or the way it was reached differs from what was stored. */
  changed: boolean;
}

async function context(tx: Tx): Promise<ScoringContext> {
  const config = await anticheatSettingsService.get();
  return {
    rules: config.rules,
    rulesVersion: config.rulesVersion,
    modpack: await anticheatModpackService.load(tx),
    curseforgeConfigured: Boolean(modsEnv().CURSEFORGE_API_KEY),
  };
}

/**
 * Scores files and stores `score`, `band`, `breakdown` and the next re-score time. A change of score
 * or path writes a history row; a change of band clears the review. Client entries have no score
 * and are left alone.
 */
async function scoreFiles(tx: Tx, sha512s: string[], ctx?: ScoringContext): Promise<ScoreResult[]> {
  if (sha512s.length === 0) return [];
  const scoring = ctx ?? (await context(tx));
  const rows = await tx
    .select({ file: anticheatFile, project: anticheatProject })
    .from(anticheatFile)
    .leftJoin(anticheatProject, eq(anticheatProject.id, anticheatFile.projectId))
    .where(inArray(anticheatFile.sha512, sha512s))
    .orderBy(anticheatFile.sha512);
  const scorable = rows.filter(({ file }) => file.kind !== 'client');
  if (scorable.length === 0) return [];

  const declaredIds = [
    ...new Set(scorable.flatMap(({ file }) => file.declared.modId?.toLowerCase() ?? [])),
  ];
  const [banned, known] = await Promise.all([
    declaredIds.length === 0
      ? []
      : tx
          .select({ modId: anticheatModIdBan.modId })
          .from(anticheatModIdBan)
          .where(inArray(anticheatModIdBan.modId, declaredIds)),
    declaredIds.length === 0
      ? { rows: [] as { mod_id: string }[] }
      : tx.execute<{ mod_id: string }>(sql`
          select distinct unnest(${anticheatProject.modIds}) as mod_id
          from ${anticheatProject}
          where (${anticheatProject.modrinthId} is not null or ${anticheatProject.curseforgeId} is not null)
            and ${anticheatProject.modIds} && ${sql.param(declaredIds)}::text[]`),
  ]);
  const bannedIds = new Set(banned.map((row) => row.modId));
  const knownIds = new Set(known.rows.map((row) => row.mod_id));

  const now = new Date();
  const results: ScoreResult[] = [];
  for (const { file, project } of scorable) {
    const modId = file.declared.modId?.toLowerCase();
    const result = scoreFile(
      {
        kind: file.kind,
        decision: file.decision,
        projectDecision: project?.decision ?? null,
        modIdBanned: modId !== undefined && bannedIds.has(modId),
        inModpack: scoring.modpack.has(file, project),
        lookupState: file.lookupState,
        modrinthProject: project?.modrinth ?? null,
        curseforgeProject: project?.curseforge ?? null,
        platformVersion: file.platformVersion,
        declared: file.declared,
        facts: file.facts,
        factsDisputed: file.factsDisputed,
        declaredModIdKnown: modId !== undefined && knownIds.has(modId),
        curseforgeConfigured: scoring.curseforgeConfigured,
        now,
      },
      scoring.rules,
    );
    const path = result.breakdown.path;
    const oldPath = file.breakdown?.path ?? null;
    const changed = result.score !== file.score || result.band !== file.band || path !== oldPath;
    results.push({ sha512: file.sha512, score: result.score, band: result.band, path, changed });

    // A file still waiting for its lookup has nothing new to store.
    if (!changed && result.score === null) continue;
    await tx
      .update(anticheatFile)
      .set({
        score: result.score,
        band: result.band,
        breakdown: { ...result.breakdown, rulesVersion: scoring.rulesVersion },
        rulesVersion: scoring.rulesVersion,
        scoredAt: now,
        rescoreAt: new Date(now.getTime() + scoring.rules.lookup.rescoreDays * DAY_MS),
        // A new band is a new question for the reviewer.
        ...(result.band !== file.band
          ? { reviewedAt: null, reviewedByUserId: null, reviewedBand: null }
          : {}),
      })
      .where(eq(anticheatFile.sha512, file.sha512));
    if (result.score !== null && (result.score !== file.score || path !== oldPath)) {
      await tx.insert(anticheatHistory).values({
        sha512: file.sha512,
        kind: 'score',
        data: {
          from: file.score,
          to: result.score,
          fromPath: oldPath,
          toPath: path,
          rulesVersion: scoring.rulesVersion,
        },
      });
    }
  }
  return results;
}

async function scoreAndStore(tx: Tx, sha512: string, ctx?: ScoringContext) {
  return (await scoreFiles(tx, [sha512], ctx))[0] ?? null;
}

export const anticheatScoringService = { context, scoreFiles, scoreAndStore };
