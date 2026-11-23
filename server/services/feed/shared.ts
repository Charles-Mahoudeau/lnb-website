import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import type { Db, Tx } from '~~/server/db';
import { feedPost, minecraftAccount } from '~~/server/db/schema';
import { createLimiter } from '~~/server/lib/rate-limit';
import { flagService } from '~~/server/services/flags';

import type { FeedProblem } from '#shared/schemas/feed';

export type { Db, Tx };
export type FeedPostRow = typeof feedPost.$inferSelect;

/** A refusal with its problem code, and what the caller needs to act on it (`oldest`). */
export function refuse(
  status: number,
  problem: FeedProblem,
  extra?: Record<string, unknown>,
): never {
  throw createError({ status, statusText: problem, data: { problem, ...extra } });
}

/** A malformed request: a plain 400 with no problem, as parseQuery answers. */
export function badRequest(): never {
  throw createError({ status: 400, statusText: 'Bad Request' });
}

/** Who acts: a player through the Minecraft server, or a person signed in on the site. */
export type FeedActor = { source: 'server'; player: string } | { source: 'site'; userId: string };

/** Who reads: the same, without the actor's rights being needed. */
export type FeedWho = { player: string } | { userId: string };

/** The linked Minecraft account `uuid` and its LNB account, or null for a guest. */
export async function linkedAccount(dbx: Db, uuid: string) {
  const [row] = await dbx
    .select({
      uuid: minecraftAccount.uuid,
      username: minecraftAccount.username,
      userId: minecraftAccount.userId,
    })
    .from(minecraftAccount)
    .where(and(eq(minecraftAccount.uuid, uuid), isNull(minecraftAccount.unlinkedAt)));
  return row ?? null;
}

/** The LNB account of a reader, or null for a guest. */
export async function userOf(dbx: Db, who: FeedWho): Promise<string | null> {
  if ('userId' in who) return who.userId;
  return (await linkedAccount(dbx, who.player))?.userId ?? null;
}

/** The pinned announcements, most recent pin first (deleting a post unpins it). */
export async function pinnedGroup(dbx: Db): Promise<{ id: string; pinnedAt: string }[]> {
  const rows = await dbx
    .select({ id: feedPost.id, pinnedAt: feedPost.pinnedAt })
    .from(feedPost)
    .where(and(isNotNull(feedPost.pinnedAt), isNull(feedPost.deletedAt)))
    .orderBy(desc(feedPost.pinnedAt), desc(feedPost.id));
  return rows.map((row) => ({ id: row.id, pinnedAt: row.pinnedAt!.toISOString() }));
}

/** A live (not deleted) post by ID, or a 404 `notFound`. */
export async function livePost(dbx: Db, id: string, lock = false): Promise<FeedPostRow> {
  const query = dbx
    .select()
    .from(feedPost)
    .where(and(eq(feedPost.id, id), isNull(feedPost.deletedAt)));
  const [row] = await (lock ? query.for('update') : query);
  if (!row) refuse(404, 'notFound');
  return row;
}

/**
 * Locks a post for a write, its main post first. Every write in a thread takes the main post's
 * lock before anything else (and account deletion takes the main posts it touches before the
 * accounts' rows), so writes in a thread queue behind one lock and never deadlock. Returns the
 * post, deleted or not, or null when there is none.
 */
export async function lockPost(tx: Tx, id: string): Promise<FeedPostRow | null> {
  const [peek] = await tx
    .select({ threadId: feedPost.threadId })
    .from(feedPost)
    .where(eq(feedPost.id, id));
  if (!peek) return null;
  if (peek.threadId) {
    await tx
      .select({ id: feedPost.id })
      .from(feedPost)
      .where(eq(feedPost.id, peek.threadId))
      .for('update');
  }
  const [row] = await tx.select().from(feedPost).where(eq(feedPost.id, id)).for('update');
  return row ?? null;
}

/** Refuses with 503 `disabled` while `feed.writing` is off: posting, replying and liking. */
export async function requireWriting(): Promise<void> {
  if (!(await flagService.isEnabled('feed.writing'))) {
    refuse(503, 'disabled', { flag: 'feed.writing' });
  }
}

// Per LNB account, counted together in the browser and in game (docs/feed.md, Rate limits). In
// memory, like the site's other limits: a deploy resets them.
const limiters = {
  post: [createLimiter(3, 60), createLimiter(15, 3600)],
  reply: [createLimiter(6, 60), createLimiter(60, 3600)],
  like: [createLimiter(60, 60)],
};

export const feedLimits = {
  /** Counts one action, or refuses with 429 `rateLimited` and the seconds to wait. */
  async check(kind: keyof typeof limiters, userId: string): Promise<void> {
    for (const consume of limiters[kind]) {
      const verdict = await consume(userId);
      if (!verdict.allowed) refuse(429, 'rateLimited', { retryAfter: verdict.retryAfterSeconds });
    }
  },
};
