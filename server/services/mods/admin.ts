import { and, eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import { mod, modListSettings, modVote, user } from '~~/server/db/schema';
import { wardenAuditService } from '~~/server/services/warden/audit';
import type { WardenActor } from '~~/server/services/warden/shared';

import { modIconService } from './icons';
import { modSettingsService } from './settings';
import { iconUrl, refuse } from './shared';
import { fetchAddable } from './suggestions';
import { modsWithVotes } from './views';

import type {
  ModAddBody,
  ModAdminPatchBody,
  ModAdminRow,
  ModConvertBody,
  ModListName,
  ModSettingsPatchBody,
  ModSettingsView,
} from '#shared/schemas/mods';

// The Mods section of the admin area. Every change is written to warden_audit, since the
// Minecraft staff runs it. See docs/mods.md.

type WebActor = WardenActor & { source: 'web' };

async function list(query: {
  list: ModListName;
  status: 'visible' | 'removed';
}): Promise<ModAdminRow[]> {
  const rows = await modsWithVotes(and(eq(mod.list, query.list), eq(mod.status, query.status)));
  return rows.map((row) => ({
    id: row.id,
    list: row.list,
    source: row.source,
    name: row.name,
    summary: row.summary,
    pageUrl: row.pageUrl,
    iconUrl: iconUrl(row),
    score: row.up - row.down,
    up: row.up,
    down: row.down,
    suggested: row.list === 'suggestion' || row.promotedAt !== null,
    proposerName: row.proposerName,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    proposer:
      row.proposerUserId && row.proposerName
        ? { userId: row.proposerUserId, name: row.proposerName, email: row.proposerEmail ?? '' }
        : null,
    removedReason: row.removedReason,
    removedAt: row.removedAt?.toISOString() ?? null,
    promotedAt: row.promotedAt?.toISOString() ?? null,
  }));
}

/** Adds a mod to the official list, from a search result or by hand. */
async function addOfficial(input: { body: ModAddBody; actor: WebActor }): Promise<{ id: number }> {
  const { body } = input;
  let values: typeof mod.$inferInsert;
  if (body.source === 'manual') {
    values = {
      list: 'official',
      source: 'manual',
      name: body.name,
      summary: body.summary ?? '',
      pageUrl: body.pageUrl,
      iconKey: body.iconUrl ? await modIconService.save(body.iconUrl) : null,
    };
  } else {
    const { project, iconKey } = await fetchAddable(body.source, body.sourceId);
    values = {
      list: 'official',
      source: project.source,
      sourceId: project.sourceId,
      name: project.name,
      summary: project.summary,
      pageUrl: project.pageUrl,
      iconKey,
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(mod).values(values).returning({ id: mod.id });
      await wardenAuditService.record(tx, {
        action: 'mod.add',
        actor: input.actor,
        data: { modId: row!.id, name: values.name, source: values.source },
      });
      return { id: row!.id };
    });
  } catch (error) {
    await modIconService.remove(values.iconKey ?? null);
    if (isUniqueViolation(error)) refuse(409, 'duplicate');
    throw error;
  }
}

/**
 * Changes the reason (even to nothing) and who gets the credit. Works on any mod, whatever its
 * tab or status. The new proposer's own vote on it is cleared, since nobody votes on their own
 * suggestion.
 */
async function edit(input: { modId: number; patch: ModAdminPatchBody; actor: WebActor }) {
  const { patch } = input;
  await db.transaction(async (tx) => {
    const set: Partial<typeof mod.$inferInsert> = {};
    if (patch.reason !== undefined) set.reason = patch.reason?.trim() || null;
    if (patch.proposerUserId !== undefined) {
      if (patch.proposerUserId !== null) {
        const [found] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, patch.proposerUserId));
        if (!found) refuse(404, 'notFound');
      }
      set.proposerUserId = patch.proposerUserId;
    }
    const [before] = await tx
      .select({ name: mod.name, proposerUserId: mod.proposerUserId })
      .from(mod)
      .where(eq(mod.id, input.modId))
      .for('update');
    if (!before) refuse(404, 'notFound');
    await tx.update(mod).set(set).where(eq(mod.id, input.modId));
    if (patch.proposerUserId) {
      await tx
        .delete(modVote)
        .where(and(eq(modVote.modId, input.modId), eq(modVote.userId, patch.proposerUserId)));
    }
    await wardenAuditService.record(tx, {
      action: 'mod.edit',
      actor: input.actor,
      targetUserId: patch.proposerUserId ?? before.proposerUserId,
      data: {
        modId: input.modId,
        name: before.name,
        reason: patch.reason !== undefined ? 'changed' : undefined,
        proposer: patch.proposerUserId !== undefined ? (patch.proposerUserId ?? 'none') : undefined,
      },
    });
  });
}

/**
 * Turns a mod into a Modrinth or CurseForge mod, or into a manual one, in place: the votes, the
 * proposer, the reason, the tab and the status stay. The details are replaced and the old icon
 * is removed. Converting to a manual mod without an icon URL keeps the current icon.
 */
async function convert(input: { modId: number; body: ModConvertBody; actor: WebActor }) {
  const { body } = input;
  const [current] = await db
    .select({ name: mod.name, source: mod.source, iconKey: mod.iconKey })
    .from(mod)
    .where(eq(mod.id, input.modId));
  if (!current) refuse(404, 'notFound');

  let values: Pick<
    typeof mod.$inferInsert,
    'source' | 'sourceId' | 'name' | 'summary' | 'pageUrl' | 'iconKey'
  >;
  if (body.source === 'manual') {
    values = {
      source: 'manual',
      sourceId: null,
      name: body.name,
      summary: body.summary ?? '',
      pageUrl: body.pageUrl,
      iconKey: body.iconUrl ? await modIconService.save(body.iconUrl) : current.iconKey,
    };
  } else {
    const { project, iconKey } = await fetchAddable(body.source, body.sourceId);
    values = {
      source: project.source,
      sourceId: project.sourceId,
      name: project.name,
      summary: project.summary,
      pageUrl: project.pageUrl,
      iconKey,
    };
  }

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(mod)
        .set(values)
        .where(eq(mod.id, input.modId))
        .returning({ proposerUserId: mod.proposerUserId });
      if (!row) refuse(404, 'notFound');
      await wardenAuditService.record(tx, {
        action: 'mod.convert',
        actor: input.actor,
        targetUserId: row.proposerUserId,
        data: {
          modId: input.modId,
          name: values.name,
          from: current.source,
          to: values.source,
        },
      });
    });
  } catch (error) {
    if (values.iconKey !== current.iconKey) await modIconService.remove(values.iconKey ?? null);
    if (isUniqueViolation(error)) refuse(409, 'duplicate');
    throw error;
  }
  if (values.iconKey !== current.iconKey) await modIconService.remove(current.iconKey);
}

/** Moves a visible suggestion to the official list, with its votes and its proposer. */
async function promote(input: { modId: number; actor: WebActor }) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(mod)
      .set({ list: 'official', promotedAt: new Date() })
      .where(and(eq(mod.id, input.modId), eq(mod.list, 'suggestion'), eq(mod.status, 'visible')))
      .returning({ name: mod.name, proposerUserId: mod.proposerUserId });
    if (!row) refuse(404, 'notSuggestion');
    await wardenAuditService.record(tx, {
      action: 'mod.promote',
      actor: input.actor,
      targetUserId: row.proposerUserId,
      data: { modId: input.modId, name: row.name },
    });
  });
}

/**
 * Hides a suggestion with a reason its proposer sees. It stays in the table, so the mod can't
 * be suggested again and the suggestion still counts toward the proposer's limit.
 */
async function remove(input: { modId: number; reason: string; actor: WebActor }) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(mod)
      .set({
        status: 'removed',
        removedReason: input.reason,
        removedAt: new Date(),
        removedByUserId: input.actor.userId,
        removalSeenAt: null,
      })
      .where(and(eq(mod.id, input.modId), eq(mod.list, 'suggestion'), eq(mod.status, 'visible')))
      .returning({ name: mod.name, proposerUserId: mod.proposerUserId });
    if (!row) refuse(404, 'notSuggestion');
    await wardenAuditService.record(tx, {
      action: 'mod.remove',
      actor: input.actor,
      targetUserId: row.proposerUserId,
      data: { modId: input.modId, name: row.name, reason: input.reason },
    });
  });
}

/** Shows a removed suggestion again, with the votes it had. */
async function restore(input: { modId: number; actor: WebActor }) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(mod)
      .set({
        status: 'visible',
        removedReason: null,
        removedAt: null,
        removedByUserId: null,
        removalSeenAt: null,
      })
      .where(and(eq(mod.id, input.modId), eq(mod.status, 'removed')))
      .returning({ name: mod.name, proposerUserId: mod.proposerUserId });
    if (!row) refuse(404, 'notFound');
    await wardenAuditService.record(tx, {
      action: 'mod.restore',
      actor: input.actor,
      targetUserId: row.proposerUserId,
      data: { modId: input.modId, name: row.name },
    });
  });
}

/** Deletes an official mod with its votes. It can be added or suggested again afterwards. */
async function deleteOfficial(input: { modId: number; actor: WebActor }) {
  const iconKey = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(mod)
      .where(and(eq(mod.id, input.modId), eq(mod.list, 'official')))
      .returning({ name: mod.name, iconKey: mod.iconKey, proposerUserId: mod.proposerUserId });
    if (!row) refuse(404, 'notOfficial');
    await wardenAuditService.record(tx, {
      action: 'mod.delete',
      actor: input.actor,
      targetUserId: row.proposerUserId,
      data: { modId: input.modId, name: row.name },
    });
    return row.iconKey;
  });
  await modIconService.remove(iconKey);
}

async function updateSettings(input: {
  patch: ModSettingsPatchBody;
  actor: WebActor;
}): Promise<ModSettingsView> {
  await db.transaction(async (tx) => {
    await tx
      .update(modListSettings)
      .set({ ...input.patch, updatedAt: new Date(), updatedByUserId: input.actor.userId })
      .where(eq(modListSettings.id, 1));
    await wardenAuditService.record(tx, {
      action: 'modSettings.update',
      actor: input.actor,
      data: { changed: input.patch },
    });
  });
  return modSettingsService.get();
}

export const modAdminService = {
  list,
  addOfficial,
  edit,
  convert,
  promote,
  remove,
  restore,
  deleteOfficial,
  settings: () => modSettingsService.get(),
  updateSettings,
};
