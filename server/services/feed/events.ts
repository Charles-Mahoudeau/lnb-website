import { and, inArray, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { feedPost } from '~~/server/db/schema';
import { minecraftEventService } from '~~/server/services/minecraft-events';

import { pinnedGroup } from './shared';

import type { FeedName } from '#shared/schemas/feed';

// The `feed` topic of minecraft_server_event (docs/feed-mod.md, section 8), read by the Minecraft
// server at `/api/feed/server/events` and, later, by the browser's live stream. Sent after the
// change commits; a failure is logged and never fails the change. No event carries the author of
// an anonymous post or anything per viewer.

export interface FeedEventItem {
  id: string;
  feed: FeedName;
  threadId: string | null;
}

async function safely(type: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    console.error(`Couldn't record the feed event ${type}`, error);
  }
}

/** A post or a reply was created. */
async function post(row: FeedEventItem & { createdAt: Date }) {
  await minecraftEventService.emit('feed', 'post', {
    id: row.id,
    feed: row.feed,
    threadId: row.threadId,
    createdAt: row.createdAt.toISOString(),
  });
}

/** Posts or replies went: deleted, or with their account. */
async function deleted(items: readonly FeedEventItem[]) {
  if (!items.length) return;
  await minecraftEventService.emit('feed', 'deleted', {
    items: items.map((item) => ({ id: item.id, feed: item.feed, threadId: item.threadId })),
  });
}

/** The likes or replies of these posts changed: sends their counts now. */
async function counts(ids: readonly string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  await safely('counts', async () => {
    const rows = await db
      .select({ id: feedPost.id, likes: feedPost.likeCount, replies: feedPost.replyCount })
      .from(feedPost)
      .where(and(inArray(feedPost.id, unique), isNull(feedPost.deletedAt)));
    if (rows.length) await minecraftEventService.emit('feed', 'counts', { items: rows });
  });
}

/** The pinned group changed: sends it whole. */
async function pins() {
  await safely('pins', async () => {
    await minecraftEventService.emit('feed', 'pins', { pinned: await pinnedGroup(db) });
  });
}

/** These Minecraft accounts' rights or state may have changed. */
async function rights(uuids: readonly string[]) {
  const unique = [...new Set(uuids)];
  if (unique.length) await minecraftEventService.emit('feed', 'rights', { uuids: unique });
}

/** The rights of these LNB accounts may have changed: names their linked accounts. */
async function rightsOfUsers(userIds: readonly string[]) {
  await minecraftEventService.emitToPlayers('feed', 'rights', userIds);
}

/** Notifications were queued. */
async function notification() {
  await minecraftEventService.emit('feed', 'notification', {});
}

export const feedEvents = { post, deleted, counts, pins, rights, rightsOfUsers, notification };
