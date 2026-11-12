import { and, countDistinct, eq, inArray, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  anticheatFile,
  anticheatHistory,
  anticheatModIdBan,
  anticheatProject,
  anticheatUsage,
} from '~~/server/db/schema';
import type { AnticheatHistoryKind, WardenAuditAction } from '~~/server/db/schema';
import { wardenAuditService } from '~~/server/services/warden/audit';
import { wardenModerationService } from '~~/server/services/warden/moderation';

import { anticheatAlertService } from './alerts';
import { anticheatLookupService } from './lookup';
import { CatalogUnavailableError, platformProject } from './platforms';
import { anticheatPlayerService } from './players';
import { anticheatRegistryService } from './registry';
import { anticheatReportService } from './reports';
import { anticheatScoringService } from './scoring';
import { anticheatSettingsService } from './settings';
import { actorUserId, refuse } from './shared';
import type { AnticheatActor, Tx } from './shared';
import { anticheatTrustService } from './trust';

import type {
  AnticheatDecisionBody,
  AnticheatBulkBody,
  AnticheatBulkResult,
  AnticheatDecisionResult,
  AnticheatModIdBanRow,
  AnticheatProjectCreateBody,
  AnticheatSettings,
  AnticheatSettingsPatch,
} from '#shared/schemas/anticheat';

// What an admin changes about files, projects and declared mod IDs. Each write runs in a
// transaction, leaves a history row where a file or project is concerned and an audit row, scores
// again what it touched, and, once committed, evaluates the open sessions holding those files.
// See docs/anticheat.md.

const DECISION_KIND: Record<'approved' | 'banned' | 'none', AnticheatHistoryKind> = {
  approved: 'approve',
  banned: 'ban',
  none: 'clear',
};
const DECISION_AUDIT: Record<'approved' | 'banned' | 'none', WardenAuditAction> = {
  approved: 'anticheat.approve',
  banned: 'anticheat.ban',
  none: 'anticheat.clear',
};

/** Works the verdicts out again. A failure is logged: the change itself is already stored. */
async function notify(sha512s: string[]): Promise<void> {
  try {
    await anticheatReportService.reevaluateFor(sha512s);
  } catch (error) {
    console.error('Anticheat: evaluation after an admin change failed', error);
  }
}

function decisionColumns(body: AnticheatDecisionBody, actor: AnticheatActor) {
  const decided = body.decision !== null;
  return {
    decision: body.decision,
    decidedAt: decided ? new Date() : null,
    decidedByUserId: decided ? actorUserId(actor) : null,
    decisionNote: decided ? (body.note ?? null) : null,
  };
}

/** Approves or bans a file by its hash, or clears the decision. */
async function decideFile(input: {
  actor: AnticheatActor;
  sha512: string;
  body: AnticheatDecisionBody;
}): Promise<void> {
  const { actor, sha512, body } = input;
  const key = body.decision ?? 'none';
  const changed = await db.transaction(async (tx) => {
    const [file] = await tx
      .select()
      .from(anticheatFile)
      .where(eq(anticheatFile.sha512, sha512))
      .for('update');
    if (!file) refuse(404, 'notFound');
    await tx
      .update(anticheatFile)
      .set(decisionColumns(body, actor))
      .where(eq(anticheatFile.sha512, sha512));
    await tx.insert(anticheatHistory).values({
      sha512,
      kind: DECISION_KIND[key],
      actorUserId: actorUserId(actor),
      data: { from: file.decision, note: body.note ?? null },
    });
    await wardenAuditService.record(tx, {
      action: DECISION_AUDIT[key],
      actor,
      data: { sha512, filename: file.filename, from: file.decision, note: body.note ?? null },
    });
    const results = await anticheatScoringService.scoreFiles(tx, [sha512]);
    return results.filter((result) => result.changed).map((result) => result.sha512);
  });
  await notify(changed);
}

/**
 * Approves or bans a project, which decides all its versions at once, or clears the decision. A ban
 * answers with the players who used one of its files and raises an alert when there are some.
 */
async function decideProject(input: {
  actor: AnticheatActor;
  projectId: string;
  body: AnticheatDecisionBody;
}): Promise<AnticheatDecisionResult> {
  const { actor, projectId, body } = input;
  const key = body.decision ?? 'none';
  const { changed, affectedPlayers } = await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(anticheatProject)
      .where(eq(anticheatProject.id, projectId))
      .for('update');
    if (!project) refuse(404, 'notFound');
    await tx
      .update(anticheatProject)
      .set({ ...decisionColumns(body, actor), updatedAt: new Date() })
      .where(eq(anticheatProject.id, projectId));
    await tx.insert(anticheatHistory).values({
      projectId,
      kind: DECISION_KIND[key],
      actorUserId: actorUserId(actor),
      data: { from: project.decision, note: body.note ?? null },
    });
    await wardenAuditService.record(tx, {
      action: DECISION_AUDIT[key],
      actor,
      data: { projectId, name: project.name, from: project.decision, note: body.note ?? null },
    });
    const results = await anticheatScoringService.rescoreProject(tx, projectId);

    let affected = 0;
    if (body.decision === 'banned') {
      const [used] = await tx
        .select({
          players: countDistinct(anticheatUsage.userId),
          sha512: sql<string | null>`min(${anticheatUsage.sha512})`,
        })
        .from(anticheatUsage)
        .innerJoin(anticheatFile, eq(anticheatFile.sha512, anticheatUsage.sha512))
        .where(eq(anticheatFile.projectId, projectId));
      affected = used?.players ?? 0;
      if (affected > 0) {
        await anticheatAlertService.raise(tx, {
          kind: 'banAffectsPlayers',
          sha512: used?.sha512 ?? null,
          data: { projectId, name: project.name, affectedPlayers: affected },
        });
      }
    }
    return {
      changed: results.filter((result) => result.changed).map((result) => result.sha512),
      affectedPlayers: affected,
    };
  });
  await notify(changed);
  return { affectedPlayers };
}

/**
 * Decides on a project nobody reported yet, from its ID on a platform. Its name and metadata are
 * fetched from the platform. Files found later join it by that ID.
 */
async function createProject(input: {
  actor: AnticheatActor;
  body: AnticheatProjectCreateBody;
}): Promise<{ id: string }> {
  const { actor, body } = input;
  let found;
  try {
    found = await platformProject(body.source, body.sourceId);
  } catch (error) {
    if (error instanceof CatalogUnavailableError) refuse(503, 'unavailable');
    throw error;
  }
  if (!found) refuse(404, 'notFound');

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(anticheatProject)
      .values({
        kind: body.kind,
        name: found.name,
        ...(body.source === 'modrinth' && 'modrinth' in found
          ? { modrinthId: found.id, modrinth: found.modrinth }
          : {}),
        ...(body.source === 'curseforge' && 'curseforge' in found
          ? { curseforgeId: found.id, curseforge: found.curseforge }
          : {}),
        ...decisionColumns({ decision: body.decision }, actor),
      })
      .onConflictDoNothing()
      .returning({ id: anticheatProject.id });
    if (!created) refuse(409, 'exists');
    await tx.insert(anticheatHistory).values({
      projectId: created.id,
      kind: DECISION_KIND[body.decision],
      actorUserId: actorUserId(actor),
      data: { created: true, source: body.source, sourceId: found.id },
    });
    await wardenAuditService.record(tx, {
      action: DECISION_AUDIT[body.decision],
      actor,
      data: { projectId: created.id, name: found.name, source: body.source, created: true },
    });
    return { id: created.id };
  });
}

/** Marks a file as looked at in the band it has now. A new band asks for a new review. */
async function markReviewed(input: { actor: AnticheatActor; sha512: string }): Promise<void> {
  const { actor, sha512 } = input;
  await db.transaction(async (tx) => {
    const [file] = await tx
      .select({ band: anticheatFile.band })
      .from(anticheatFile)
      .where(eq(anticheatFile.sha512, sha512))
      .for('update');
    if (!file) refuse(404, 'notFound');
    if (!file.band) refuse(409, 'notScored');
    await tx
      .update(anticheatFile)
      .set({
        reviewedAt: new Date(),
        reviewedByUserId: actorUserId(actor),
        reviewedBand: file.band,
      })
      .where(eq(anticheatFile.sha512, sha512));
    await tx.insert(anticheatHistory).values({
      sha512,
      kind: 'reviewed',
      actorUserId: actorUserId(actor),
      data: { band: file.band },
    });
    await wardenAuditService.record(tx, {
      action: 'anticheat.reviewed',
      actor,
      data: { sha512, band: file.band },
    });
  });
}

/** A note on a file's history. */
async function addNote(input: {
  actor: AnticheatActor;
  sha512: string;
  body: string;
}): Promise<void> {
  const [file] = await db
    .select({ sha512: anticheatFile.sha512 })
    .from(anticheatFile)
    .where(eq(anticheatFile.sha512, input.sha512));
  if (!file) refuse(404, 'notFound');
  await db.insert(anticheatHistory).values({
    sha512: input.sha512,
    kind: 'note',
    actorUserId: actorUserId(input.actor),
    data: { body: input.body },
  });
}

/** Scores one file again now. */
async function rescoreFile(sha512: string): Promise<void> {
  const changed = await db.transaction(async (tx) => {
    const [file] = await tx
      .select({ sha512: anticheatFile.sha512 })
      .from(anticheatFile)
      .where(eq(anticheatFile.sha512, sha512))
      .for('update');
    if (!file) refuse(404, 'notFound');
    const results = await anticheatScoringService.scoreFiles(tx, [sha512]);
    return results.filter((result) => result.changed).map((result) => result.sha512);
  });
  await notify(changed);
}

/** Marks every scored file stale. The re-score task works through them. Returns how many. */
async function rescoreAll(): Promise<number> {
  const rows = await db
    .update(anticheatFile)
    .set({ rescoreAt: new Date() })
    .where(sql`${anticheatFile.kind} <> 'client'`)
    .returning({ sha512: anticheatFile.sha512 });
  return rows.length;
}

async function scoreProjects(tx: Tx, projectIds: string[]): Promise<string[]> {
  const changed: string[] = [];
  const ctx = await anticheatScoringService.context(tx);
  for (const id of projectIds) {
    const results = await anticheatScoringService.rescoreProject(tx, id, ctx);
    changed.push(...results.filter((result) => result.changed).map((result) => result.sha512));
  }
  return changed;
}

/** Merges another project into this one, as the lookup does when a file is on both platforms. */
async function link(input: {
  actor: AnticheatActor;
  projectId: string;
  otherProjectId: string;
}): Promise<void> {
  const { actor, projectId, otherProjectId } = input;
  if (projectId === otherProjectId) refuse(409, 'sameProject');
  const changed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(anticheatProject)
      .where(inArray(anticheatProject.id, [projectId, otherProjectId]))
      .orderBy(anticheatProject.id)
      .for('update');
    const keep = rows.find((row) => row.id === projectId);
    const other = rows.find((row) => row.id === otherProjectId);
    if (!keep || !other) refuse(404, 'notFound');
    await anticheatLookupService.merge(tx, keep, other, actorUserId(actor));
    await wardenAuditService.record(tx, {
      action: 'anticheat.link',
      actor,
      data: { projectId, merged: otherProjectId, name: keep.name, mergedName: other.name },
    });
    return scoreProjects(tx, [projectId]);
  });
  await notify(changed);
}

/**
 * Splits a platform off a project into its own project, moving the files found on that platform
 * only. The new project keeps the decision, so a ban isn't escaped by splitting.
 */
async function unlink(input: {
  actor: AnticheatActor;
  projectId: string;
  platform: 'modrinth' | 'curseforge';
}): Promise<{ id: string }> {
  const { actor, projectId, platform } = input;
  const other = platform === 'modrinth' ? 'curseforge' : 'modrinth';
  const { created, changed } = await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(anticheatProject)
      .where(eq(anticheatProject.id, projectId))
      .for('update');
    if (!project) refuse(404, 'notFound');
    const platformId = project[`${platform}Id`];
    if (!platformId || !project[`${other}Id`]) refuse(409, 'notLinked');
    const metadata = project[platform];

    // The IDs are unique: free the platform's before the new project takes it.
    await tx
      .update(anticheatProject)
      .set({ [`${platform}Id`]: null, [platform]: null, updatedAt: new Date() })
      .where(eq(anticheatProject.id, projectId));
    const [split] = await tx
      .insert(anticheatProject)
      .values({
        kind: project.kind,
        name:
          (metadata && 'title' in metadata ? metadata.title : undefined) ??
          (metadata && 'name' in metadata ? metadata.name : undefined) ??
          project.name,
        [`${platform}Id`]: platformId,
        [platform]: metadata,
        modIds: project.modIds,
        decision: project.decision,
        decidedAt: project.decidedAt,
        decidedByUserId: project.decidedByUserId,
        decisionNote: project.decisionNote,
      })
      .returning({ id: anticheatProject.id });
    await tx
      .update(anticheatFile)
      .set({ projectId: split!.id })
      .where(
        and(
          eq(anticheatFile.projectId, projectId),
          sql`${anticheatFile.platformVersion} ? ${platform}`,
          sql`not (${anticheatFile.platformVersion} ? ${other})`,
        ),
      );
    const data = { platform, from: projectId, to: split!.id };
    for (const id of [projectId, split!.id]) {
      await tx.insert(anticheatHistory).values({
        projectId: id,
        kind: 'unlink',
        actorUserId: actorUserId(actor),
        data,
      });
    }
    await wardenAuditService.record(tx, { action: 'anticheat.unlink', actor, data });
    return { created: split!.id, changed: await scoreProjects(tx, [projectId, split!.id]) };
  });
  await notify(changed);
  return { id: created };
}

// Declared mod IDs

async function modIdBans(): Promise<AnticheatModIdBanRow[]> {
  const rows = await db.select().from(anticheatModIdBan).orderBy(anticheatModIdBan.modId);
  const actors = await anticheatRegistryService.names(
    db,
    rows.map((row) => row.createdByUserId),
  );
  return rows.map((row) => ({
    modId: row.modId,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdByUserId ? (actors.get(row.createdByUserId) ?? null) : null,
  }));
}

/** Files that declare the mod ID, to score again after the list changed. */
async function scoreModId(tx: Tx, modId: string): Promise<string[]> {
  const rows = await tx
    .select({ sha512: anticheatFile.sha512 })
    .from(anticheatFile)
    .where(sql`lower(${anticheatFile.declared}->>'modId') = ${modId}`);
  const results = await anticheatScoringService.scoreFiles(
    tx,
    rows.map((row) => row.sha512),
  );
  return results.filter((result) => result.changed).map((result) => result.sha512);
}

async function banModId(input: {
  actor: AnticheatActor;
  modId: string;
  reason: string;
}): Promise<void> {
  const { actor, modId, reason } = input;
  const changed = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(anticheatModIdBan)
      .values({ modId, reason, createdByUserId: actorUserId(actor) })
      .onConflictDoNothing()
      .returning({ modId: anticheatModIdBan.modId });
    if (!created) refuse(409, 'exists');
    await wardenAuditService.record(tx, {
      action: 'anticheat.modIdBan',
      actor,
      data: { modId, reason },
    });
    return scoreModId(tx, modId);
  });
  await notify(changed);
}

async function unbanModId(input: { actor: AnticheatActor; modId: string }): Promise<void> {
  const { actor, modId } = input;
  const changed = await db.transaction(async (tx) => {
    const removed = await tx
      .delete(anticheatModIdBan)
      .where(eq(anticheatModIdBan.modId, modId))
      .returning({ modId: anticheatModIdBan.modId });
    if (removed.length === 0) refuse(404, 'notFound');
    await wardenAuditService.record(tx, { action: 'anticheat.modIdUnban', actor, data: { modId } });
    return scoreModId(tx, modId);
  });
  await notify(changed);
}

// Settings

function settingsView(
  config: Awaited<ReturnType<typeof anticheatSettingsService.get>>,
): AnticheatSettings {
  return {
    mode: config.mode,
    rulesVersion: config.rulesVersion,
    rules: config.rules,
    updatedAt: config.updatedAt.toISOString(),
  };
}

async function settings(): Promise<AnticheatSettings> {
  return settingsView(await anticheatSettingsService.get());
}

/**
 * Changes the mode or the rules. New rules make a new version, and every file is marked stale so
 * the re-score task works it out again under them.
 */
async function updateSettings(input: {
  actor: AnticheatActor;
  patch: AnticheatSettingsPatch;
}): Promise<AnticheatSettings> {
  const before = await anticheatSettingsService.get();
  const after = await anticheatSettingsService.update({
    actorId: actorUserId(input.actor) ?? '',
    mode: input.patch.mode,
    rules: input.patch.rules,
  });
  if (after.rulesVersion !== before.rulesVersion) await rescoreAll();
  return settingsView(after);
}

// Players

/**
 * Bans, holds or takes points from several players of one file. Each player is handled on their
 * own: one who can't be (not a player of the file, already banned, already held) is skipped and the
 * rest go through. A ban uses the Warden ban service; a penalty is a `bulkPenalty` event.
 */
async function bulkPlayers(input: {
  actor: AnticheatActor;
  sha512: string;
  body: AnticheatBulkBody;
}): Promise<AnticheatBulkResult> {
  const { actor, sha512, body } = input;
  const [file] = await db
    .select({ sha512: anticheatFile.sha512 })
    .from(anticheatFile)
    .where(eq(anticheatFile.sha512, sha512));
  if (!file) refuse(404, 'notFound');
  const userIds = [...new Set(body.userIds)];
  const users = await db
    .select({ userId: anticheatUsage.userId })
    .from(anticheatUsage)
    .where(and(eq(anticheatUsage.sha512, sha512), inArray(anticheatUsage.userId, userIds)));
  const usedIt = new Set(users.map((row) => row.userId));

  const skipped: AnticheatBulkResult['skipped'] = [];
  let applied = 0;
  for (const userId of userIds) {
    if (!usedIt.has(userId)) {
      skipped.push({ userId, why: 'notAPlayer' });
    } else if (body.action === 'ban') {
      if (await wardenModerationService.activeBan(userId)) {
        skipped.push({ userId, why: 'alreadyBanned' });
        continue;
      }
      await wardenModerationService.ban({
        userId,
        body: { reason: body.reason, durationSeconds: body.durationSeconds ?? null },
        actor,
      });
      applied++;
    } else if (body.action === 'hold') {
      if ((await anticheatPlayerService.get(db, userId)).manualHold) {
        skipped.push({ userId, why: 'alreadyHeld' });
        continue;
      }
      await anticheatTrustService.setHold({ actor, userId, hold: true, reason: body.reason });
      applied++;
    } else {
      const points = body.points ?? 0;
      await db.transaction((tx) =>
        anticheatPlayerService.record(tx, {
          userId,
          kind: 'bulkPenalty',
          delta: -points,
          data: { reason: body.reason, sha512, points },
          actorUserId: actorUserId(actor),
        }),
      );
      await anticheatReportService.reevaluateForUser(userId);
      applied++;
    }
  }
  await db.transaction((tx) =>
    wardenAuditService.record(tx, {
      action: 'anticheat.bulk',
      actor,
      data: {
        sha512,
        action: body.action,
        reason: body.reason,
        requested: userIds.length,
        applied,
        skipped: skipped.length,
      },
    }),
  );
  return { applied, skipped };
}

export const anticheatAdminService = {
  settings,
  updateSettings,
  bulkPlayers,
  decideFile,
  decideProject,
  createProject,
  markReviewed,
  addNote,
  rescoreFile,
  rescoreAll,
  link,
  unlink,
  modIdBans,
  banModId,
  unbanModId,
};
