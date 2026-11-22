import { eq, inArray, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import { modpackMod, modpackRetired, user } from '~~/server/db/schema';
import { anticheatSettingsService } from '~~/server/services/anticheat/settings';
import { auditService } from '~~/server/services/audit';
import type { WardenActor } from '~~/server/services/warden/shared';

import { bump } from './revision';

import { MODPACK_RETIRED_MAX, MODPACK_RETIRED_SAFE_DAYS } from '#shared/schemas/modpack';
import type {
  ModpackProblem,
  ModpackRetiredAddBody,
  ModpackRetiredAddResult,
  ModpackRetiredList,
  ModpackRetiredPatchBody,
  ModpackRetiredPlayers,
  ModpackRetiredView,
} from '#shared/schemas/modpack';

// Retired files: names (and optional hashes) the updater deletes from players' mods folders although
// its journal never listed them. The manifest carries them, and the admin counts the players who
// still have one from their latest anticheat report. See docs/modpack.md.

type WebActor = WardenActor & { source: 'web' };

function refuse(status: number, problem: ModpackProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

const DAY = 86_400_000;
const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] ?? null;

// What the updater would delete: the name matches, and the hash too when the entry has one.
const MATCH = sql`f.filename = r.file_name AND (r.sha512 IS NULL OR f.sha512 = r.sha512)`;

/** Whether players can be counted: the anticheat stores no report while it is off. */
async function countAll(tx: Tx): Promise<number> {
  const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(modpackRetired);
  return row?.count ?? 0;
}

async function counted(): Promise<boolean> {
  return (await anticheatSettingsService.get()).mode !== 'off';
}

async function list(): Promise<ModpackRetiredList> {
  const rows = await db
    .select({ row: modpackRetired, adder: user.name })
    .from(modpackRetired)
    .leftJoin(user, eq(user.id, modpackRetired.addedByUserId))
    .orderBy(modpackRetired.fileName);
  const isCounted = await counted();
  const players = new Map<string, number>();
  const seen = new Map<string, Date>();
  if (isCounted && rows.length > 0) {
    // The newest report of each account is what is on its disk now.
    const now = await db.execute<{ id: string; players: number }>(sql`
      WITH latest AS (
        SELECT DISTINCT ON (user_id) id, user_id FROM anticheat_report ORDER BY user_id, created_at DESC
      )
      SELECT r.id, count(DISTINCT l.user_id)::int AS players
      FROM modpack_retired r
      JOIN anticheat_report_file f ON ${MATCH}
      JOIN latest l ON l.id = f.report_id
      GROUP BY r.id`);
    for (const { id, players: count } of now.rows) players.set(id, count);
    const ever = await db.execute<{ id: string; seen: Date }>(sql`
      SELECT r.id, max(p.created_at) AS seen
      FROM modpack_retired r
      JOIN anticheat_report_file f ON ${MATCH}
      JOIN anticheat_report p ON p.id = f.report_id
      GROUP BY r.id`);
    for (const { id, seen: at } of ever.rows) seen.set(id, new Date(at));
  }
  const now = Date.now();
  const items = rows.map(({ row, adder }): ModpackRetiredView => {
    const count = isCounted ? (players.get(row.id) ?? 0) : null;
    const lastSeen = seen.get(row.id) ?? null;
    // Zero since the later of the last time a player had it and the day the entry was made.
    const since = Math.max(lastSeen?.getTime() ?? 0, row.createdAt.getTime());
    const zeroDays = count === 0 ? Math.floor((now - since) / DAY) : null;
    return {
      id: row.id,
      fileName: row.fileName,
      sha512: row.sha512,
      note: row.note,
      addedAt: row.createdAt.toISOString(),
      addedBy: firstName(adder),
      players: count,
      lastSeenAt: lastSeen?.toISOString() ?? null,
      safeToDrop: zeroDays !== null && zeroDays >= MODPACK_RETIRED_SAFE_DAYS,
      zeroDays,
    };
  });
  return { items, counted: isCounted, max: MODPACK_RETIRED_MAX };
}

/** The accounts whose newest report holds the file, newest report first. */
async function players(id: string): Promise<ModpackRetiredPlayers> {
  const [row] = await db.select().from(modpackRetired).where(eq(modpackRetired.id, id));
  if (!row) refuse(404, 'notFound');
  if (!(await counted())) return { items: [], total: 0 };
  const { rows } = await db.execute<{ user_id: string; name: string; at: Date }>(sql`
    WITH latest AS (
      SELECT DISTINCT ON (user_id) id, user_id, created_at FROM anticheat_report ORDER BY user_id, created_at DESC
    )
    SELECT DISTINCT l.user_id, u.name, l.created_at AS at
    FROM modpack_retired r
    JOIN anticheat_report_file f ON ${MATCH}
    JOIN latest l ON l.id = f.report_id
    JOIN "user" u ON u.id = l.user_id
    WHERE r.id = ${id}
    ORDER BY l.created_at DESC`);
  return {
    items: rows.slice(0, 50).map((r) => ({
      userId: r.user_id,
      name: r.name,
      lastReportAt: new Date(r.at).toISOString(),
    })),
    total: rows.length,
  };
}

/** Adds the files in one change. A name already in the list is skipped. */
async function add(input: {
  body: ModpackRetiredAddBody;
  actor: WebActor;
}): Promise<ModpackRetiredAddResult> {
  return db.transaction(async (tx) => {
    // Two admins pasting at once must not both pass the cap.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('modpack_retired'))`);
    const count = await countAll(tx);
    // A file the pack uses now must not be retired: launchers would delete what they just installed.
    const names = input.body.items.map((item) => item.fileName);
    const inUse = new Set(
      (
        await tx
          .select({ name: modpackMod.pinnedFileName })
          .from(modpackMod)
          .where(inArray(modpackMod.pinnedFileName, names))
      ).map((row) => row.name),
    );
    const byName = new Map(
      input.body.items
        .filter((item) => !inUse.has(item.fileName))
        .map((item) => [item.fileName, item]),
    );
    if (byName.size === 0) return { added: 0, skipped: input.body.items.length };
    const rows = await tx
      .insert(modpackRetired)
      .values(
        [...byName.values()].map((item) => ({
          fileName: item.fileName,
          sha512: item.sha512 ?? null,
          note: input.body.note,
          addedByUserId: input.actor.userId,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: modpackRetired.id, fileName: modpackRetired.fileName });
    if (count + rows.length > MODPACK_RETIRED_MAX) refuse(409, 'tooManyRetired');
    if (rows.length > 0) {
      await bump(tx);
      await auditService.record(tx, {
        action: 'minecraft.modpack.retire',
        actor: input.actor,
        data: { count: rows.length, name: rows[0]!.fileName },
      });
    }
    return { added: rows.length, skipped: input.body.items.length - rows.length };
  });
}

async function edit(input: { id: string; body: ModpackRetiredPatchBody; actor: WebActor }) {
  await db.transaction(async (tx) => {
    let rows;
    try {
      rows = await tx
        .update(modpackRetired)
        .set(input.body)
        .where(eq(modpackRetired.id, input.id))
        .returning();
    } catch (error) {
      // The unique index on the name.
      if ((error as { cause?: { code?: string } }).cause?.code === '23505')
        refuse(409, 'duplicate');
      throw error;
    }
    const [row] = rows;
    if (!row) refuse(404, 'notFound');
    await bump(tx);
    await auditService.record(tx, {
      action: 'minecraft.modpack.retire.edit',
      actor: input.actor,
      data: { name: row.fileName },
    });
  });
}

async function remove(input: { id: string; actor: WebActor }) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(modpackRetired)
      .where(eq(modpackRetired.id, input.id))
      .returning();
    if (!row) refuse(404, 'notFound');
    await bump(tx);
    await auditService.record(tx, {
      action: 'minecraft.modpack.retire.remove',
      actor: input.actor,
      data: { name: row.fileName },
    });
  });
}

/**
 * Retires the pinned files of mods that just left the Modlist, in the caller's transaction (the
 * caller raises the revision). A mod with no pinned file adds nothing, and a name already in the
 * list keeps its entry. Past the cap nothing is added: the removal must not fail for it.
 */
async function retirePinned(
  tx: Tx,
  mods: { pinnedFileName: string | null; pinnedSha512: string | null }[],
  actor: WebActor,
): Promise<number> {
  const files = mods.filter((mod) => mod.pinnedFileName);
  if (files.length === 0) return 0;
  const count = await countAll(tx);
  if (count + files.length > MODPACK_RETIRED_MAX) return 0;
  const date = new Date().toISOString().slice(0, 10);
  const rows = await tx
    .insert(modpackRetired)
    .values(
      files.map((mod) => ({
        fileName: mod.pinnedFileName!,
        sha512: mod.pinnedSha512?.toLowerCase() ?? null,
        note: `Removed from the Modlist on ${date}`,
        addedByUserId: actor.userId,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: modpackRetired.id });
  return rows.length;
}

/**
 * Drops the entries for files the pack lists again, in the caller's transaction (the caller raises
 * the revision). A mod added back, or pinned to a file that was retired, must not be deleted
 * by the launchers right after they install it.
 */
async function unretire(tx: Tx, fileNames: (string | null | undefined)[]): Promise<void> {
  const names = fileNames.filter((name): name is string => !!name);
  if (names.length > 0)
    await tx.delete(modpackRetired).where(inArray(modpackRetired.fileName, names));
}

/** What the manifest lists: every entry, with its hash when it has one. */
async function forManifest(): Promise<{ fileName: string; sha512?: string }[]> {
  const rows = await db.select().from(modpackRetired).orderBy(modpackRetired.fileName);
  return rows.map((row) => ({
    fileName: row.fileName,
    ...(row.sha512 ? { sha512: row.sha512 } : {}),
  }));
}

export const modpackRetiredService = {
  list,
  players,
  add,
  edit,
  remove,
  retirePinned,
  unretire,
  forManifest,
};
