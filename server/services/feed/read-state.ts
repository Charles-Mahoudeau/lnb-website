import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { feedMember, feedPost, feedThreadSeen } from '~~/server/db/schema';

import { livePost, refuse, userOf } from './shared';
import type { Db, FeedWho } from './shared';

import type { FeedName, FeedUnread } from '#shared/schemas/feed';

// Read state, per LNB account (docs/feed.md, "Read state and notifications"): when it last viewed
// each feed (the unread dots) and when it last opened each thread (the unseen-replies markers).
// Guests have none: their dots are false and marking does nothing.

/** Whether the feed holds a live main post by someone else, newer than `seenAt`. */
async function hasNewer(dbx: Db, userId: string, feed: FeedName, seenAt: Date | null) {
  const [row] = await dbx
    .select({ one: sql<number>`1` })
    .from(feedPost)
    .where(
      and(
        eq(feedPost.feed, feed),
        isNull(feedPost.threadId),
        isNull(feedPost.deletedAt),
        ne(feedPost.authorUserId, userId),
        seenAt ? gt(feedPost.createdAt, seenAt) : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** The tab dots of an LNB account, false for a guest. */
async function unread(dbx: Db, userId: string | null): Promise<FeedUnread> {
  if (!userId) return { announcements: false, global: false };
  const [member] = await dbx.select().from(feedMember).where(eq(feedMember.userId, userId));
  return {
    announcements: await hasNewer(
      dbx,
      userId,
      'announcements',
      member?.announcementsSeenAt ?? null,
    ),
    global: await hasNewer(dbx, userId, 'global', member?.globalSeenAt ?? null),
  };
}

/**
 * A feed was viewed up to the `createdAt` of the newest post shown. Keeps the later of the stored
 * and sent times, never past now.
 */
async function markFeedSeen(who: FeedWho, feed: FeedName, upTo: Date): Promise<void> {
  const userId = await userOf(db, who);
  if (!userId) return;
  const now = new Date();
  const at = new Date(Math.min(upTo.getTime(), now.getTime()));
  const column = feed === 'announcements' ? 'announcementsSeenAt' : 'globalSeenAt';
  const excluded = sql.raw(
    `excluded.${feed === 'announcements' ? 'announcements_seen_at' : 'global_seen_at'}`,
  );
  await db
    .insert(feedMember)
    .values({ userId, [column]: at, updatedAt: now })
    .onConflictDoUpdate({
      target: feedMember.userId,
      // PostgreSQL's greatest() skips nulls, so a first view just stores the time.
      set: { [column]: sql`greatest(${feedMember[column]}, ${excluded})`, updatedAt: now },
    });
}

/** A thread was opened: its markers clear. 404 for an unknown, deleted or reply ID. */
async function markThreadSeen(who: FeedWho, threadId: string): Promise<void> {
  const post = await livePost(db, threadId);
  if (post.threadId) refuse(404, 'notFound');
  const userId = await userOf(db, who);
  if (!userId) return;
  const now = new Date();
  await db
    .insert(feedThreadSeen)
    .values({ userId, threadId, seenAt: now })
    .onConflictDoUpdate({
      target: [feedThreadSeen.userId, feedThreadSeen.threadId],
      set: { seenAt: now },
    });
}

export const feedReadStateService = { unread, markFeedSeen, markThreadSeen };
