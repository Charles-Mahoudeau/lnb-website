import { desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Db } from '~~/server/db';
import { mod, modVote, user } from '~~/server/db/schema';

// The mod rows with their vote counts, shared by the page and the admin area.

const up = sql<number>`count(${modVote.userId}) filter (where ${modVote.value} = 1)`.mapWith(
  Number,
);
const down = sql<number>`count(${modVote.userId}) filter (where ${modVote.value} = -1)`.mapWith(
  Number,
);

/** Mods matching `where`, with up and down counts, by score then newest. */
export async function modsWithVotes(where: SQL | undefined, dbx: Db = db) {
  const rows = await dbx
    .select({
      id: mod.id,
      list: mod.list,
      status: mod.status,
      source: mod.source,
      name: mod.name,
      summary: mod.summary,
      pageUrl: mod.pageUrl,
      iconKey: mod.iconKey,
      reason: mod.reason,
      proposerUserId: mod.proposerUserId,
      proposerName: user.name,
      proposerEmail: user.email,
      removedReason: mod.removedReason,
      removedAt: mod.removedAt,
      promotedAt: mod.promotedAt,
      createdAt: mod.createdAt,
      up,
      down,
    })
    .from(mod)
    .leftJoin(modVote, eq(modVote.modId, mod.id))
    .leftJoin(user, eq(user.id, mod.proposerUserId))
    .where(where)
    .groupBy(mod.id, user.id)
    .orderBy(desc(sql`${up} - ${down}`), desc(mod.createdAt));
  return rows;
}

export type ModRow = Awaited<ReturnType<typeof modsWithVotes>>[number];

/** The counts of one mod, after a vote. */
export async function voteCounts(modId: number, dbx: Db = db) {
  const [row] = await dbx.select({ up, down }).from(modVote).where(eq(modVote.modId, modId));
  return { up: row?.up ?? 0, down: row?.down ?? 0 };
}
