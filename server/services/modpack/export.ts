import { and, eq, inArray } from 'drizzle-orm';

import { db } from '~~/server/db';
import { mod, modpackMod, modpackState } from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';
import type { WardenActor } from '~~/server/services/warden/shared';

import { valuesFor } from './index';
import { modpackRetiredService } from './retired';
import { bump } from './revision';

import type {
  ModpackExportItem,
  ModpackExportMode,
  ModpackExportPreview,
  ModpackExportResult,
} from '#shared/schemas/modpack';

// Copies the vote's official list to the Modlist. The diff is computed here, shown to the admin,
// and recomputed when they apply: the client only sends which changes it ticked. See docs/modpack.md.

type WebActor = WardenActor & { source: 'web' };
type Change = ModpackExportItem & {
  /** The vote mod to add, or the Modlist entry to remove or update. */
  vote?: { id: number; source: 'modrinth' | 'curseforge'; sourceId: string };
  packId?: string;
};

async function diff(mode: ModpackExportMode): Promise<{ changes: Change[]; skipped: string[] }> {
  const votes = await db
    .select({
      id: mod.id,
      source: mod.source,
      sourceId: mod.sourceId,
      name: mod.name,
      optional: mod.optional,
    })
    .from(mod)
    .where(and(eq(mod.list, 'official'), eq(mod.status, 'visible')))
    .orderBy(mod.name);
  const pack = await db.select().from(modpackMod).orderBy(modpackMod.name);
  const packByKey = new Map(
    pack.filter((row) => row.sourceId).map((row) => [`${row.source}:${String(row.sourceId)}`, row]),
  );
  const voteKeys = new Set<string>();
  const changes: Change[] = [];
  const skipped: string[] = [];

  for (const vote of votes) {
    if (vote.source === 'manual' || !vote.sourceId) {
      skipped.push(vote.name);
      continue;
    }
    const key = `${vote.source}:${vote.sourceId}`;
    voteKeys.add(key);
    const existing = packByKey.get(key);
    if (!existing) {
      changes.push({
        key: `add:${String(vote.id)}`,
        kind: 'add',
        name: vote.name,
        source: vote.source,
        custom: false,
        optional: vote.optional,
        vote: { id: vote.id, source: vote.source, sourceId: vote.sourceId },
      });
    } else if (mode !== 'add' && existing.optional !== vote.optional) {
      changes.push({
        key: `update:${existing.id}`,
        kind: 'update',
        name: existing.name,
        source: existing.source as ModpackExportItem['source'],
        custom: false,
        optional: vote.optional,
        packId: existing.id,
      });
    }
  }

  if (mode !== 'add') {
    for (const row of pack) {
      if (row.sourceId && voteKeys.has(`${row.source}:${row.sourceId}`)) continue;
      const custom = row.source === 'url' || row.source === 'upload';
      // Sync only drops what came from the catalogs: a link or an uploaded jar was never on the vote.
      if (custom && mode !== 'replace') continue;
      changes.push({
        key: `remove:${row.id}`,
        kind: 'remove',
        name: row.name,
        source: row.source as ModpackExportItem['source'],
        custom,
        optional: row.optional,
        packId: row.id,
      });
    }
  }
  return { changes, skipped };
}

async function preview(mode: ModpackExportMode): Promise<ModpackExportPreview> {
  const { changes, skipped } = await diff(mode);
  const [state] = await db.select().from(modpackState).where(eq(modpackState.id, 1));
  return {
    revision: state?.revision ?? 1,
    items: changes.map(({ vote: _vote, packId: _packId, ...item }) => item),
    skipped,
  };
}

/** Applies the ticked changes, in one change that raises the manifest revision once. */
async function apply(input: {
  mode: ModpackExportMode;
  keys: string[];
  actor: WebActor;
}): Promise<ModpackExportResult> {
  const ticked = new Set(input.keys);
  const chosen = (await diff(input.mode)).changes.filter((change) => ticked.has(change.key));
  const result: ModpackExportResult = { added: 0, removed: 0, updated: 0, flagged: 0, failed: 0 };

  // Looking up files asks the sources, so it happens before the transaction opens.
  const inserts: { values: typeof modpackMod.$inferInsert; voteId: number }[] = [];
  for (const change of chosen) {
    if (change.kind !== 'add' || !change.vote) continue;
    try {
      const values = await valuesFor({
        source: change.vote.source,
        sourceId: change.vote.sourceId,
        optional: change.optional,
      });
      inserts.push({ values, voteId: change.vote.id });
    } catch {
      result.failed++;
    }
  }
  const removeIds = chosen.flatMap((c) => (c.kind === 'remove' && c.packId ? [c.packId] : []));
  const updates = chosen.filter((c) => c.kind === 'update' && c.packId);

  await db.transaction(async (tx) => {
    const addedFiles: (string | null | undefined)[] = [];
    for (const { values, voteId } of inserts) {
      const rows = await tx
        .insert(modpackMod)
        .values({ ...values, voteModId: voteId })
        .onConflictDoNothing()
        .returning({ id: modpackMod.id });
      if (rows.length === 0) continue;
      addedFiles.push(values.pinnedFileName);
      result.added++;
      if (values.attention) result.flagged++;
    }
    if (removeIds.length > 0) {
      const gone = await tx.delete(modpackMod).where(inArray(modpackMod.id, removeIds)).returning();
      result.removed = gone.length;
      await modpackRetiredService.retirePinned(tx, gone, input.actor);
    }
    // After the removals, so a file both removed and added again stays out of the list.
    await modpackRetiredService.unretire(tx, addedFiles);
    for (const change of updates) {
      await tx
        .update(modpackMod)
        .set({ optional: change.optional })
        .where(eq(modpackMod.id, change.packId!));
      result.updated++;
    }
    if (result.added + result.removed + result.updated === 0) return;
    await bump(tx);
    await auditService.record(tx, {
      action: 'minecraft.modpack.export',
      actor: input.actor,
      data: {
        name: input.mode,
        mode: input.mode,
        added: result.added,
        removed: result.removed,
        updated: result.updated,
      },
    });
  });
  return result;
}

export const modpackExportService = { preview, apply };
