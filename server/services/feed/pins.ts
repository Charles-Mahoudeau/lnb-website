import { eq, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { feedPost } from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';

import { feedEvents } from './events';
import { feedRightsService } from './rights';
import type { FeedWriter } from './rights';
import { PIN_LIMIT } from './rules';
import { livePost, pinnedGroup, refuse } from './shared';
import type { FeedActor, FeedPostRow, Tx } from './shared';

import type { FeedPinsResult } from '#shared/schemas/feed';

// Pinning announcements (docs/feed.md, Pinning): at most 3, the most recently pinned first. A full
// group refuses a fourth pin with `pinLimit` and the pin that would go, unless `replace` says to
// unpin it, in the same transaction. Pinning a pinned post, or unpinning one that isn't, changes
// nothing. Not behind `feed.writing`, so moderation never stops.

/** The announcer behind a pin, and the announcement, or the matching refusal. */
async function check(actor: FeedActor, postId: string): Promise<FeedWriter> {
  const writer = await feedRightsService.writer(db, actor, 'linked');
  if (writer.person.banned) refuse(403, 'banned');
  if (!writer.person.rights.announce) refuse(403, 'notAllowed');
  pinnable(await livePost(db, postId));
  return writer;
}

function pinnable(post: FeedPostRow): void {
  if (post.threadId !== null || post.feed !== 'announcements') refuse(409, 'notPinnable');
}

async function lockPins(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('feed:pins'))`);
}

function auditTarget(post: FeedPostRow): string | null {
  return post.anonymous ? null : post.authorUserId;
}

async function pin(input: {
  actor: FeedActor;
  postId: string;
  replace?: boolean;
}): Promise<FeedPinsResult> {
  const writer = await check(input.actor, input.postId);
  const outcome = await db.transaction(async (tx) => {
    await lockPins(tx);
    const post = await livePost(tx, input.postId, true);
    pinnable(post);
    const group = await pinnedGroup(tx);
    if (post.pinnedAt) return { pinned: group, unpinned: null, changed: false };
    let unpinned: string | null = null;
    if (group.length >= PIN_LIMIT) {
      const oldest = group.at(-1)!;
      if (!input.replace) refuse(409, 'pinLimit', { oldest: { id: oldest.id } });
      await tx
        .update(feedPost)
        .set({ pinnedAt: null, pinnedByUserId: null })
        .where(eq(feedPost.id, oldest.id));
      unpinned = oldest.id;
    }
    await tx
      .update(feedPost)
      .set({ pinnedAt: new Date(), pinnedByUserId: writer.userId })
      .where(eq(feedPost.id, post.id));
    await auditService.record(tx, {
      action: 'minecraft.feed.pin',
      actor: writer.auditActor,
      targetUserId: auditTarget(post),
      data: { postId: post.id, replaced: unpinned },
    });
    return { pinned: await pinnedGroup(tx), unpinned, changed: true };
  });
  if (outcome.changed) await feedEvents.pins();
  return { pinned: outcome.pinned, unpinned: outcome.unpinned };
}

async function unpin(input: { actor: FeedActor; postId: string }): Promise<FeedPinsResult> {
  const writer = await check(input.actor, input.postId);
  const outcome = await db.transaction(async (tx) => {
    await lockPins(tx);
    const post = await livePost(tx, input.postId, true);
    if (!post.pinnedAt) return { pinned: await pinnedGroup(tx), changed: false };
    await tx
      .update(feedPost)
      .set({ pinnedAt: null, pinnedByUserId: null })
      .where(eq(feedPost.id, post.id));
    await auditService.record(tx, {
      action: 'minecraft.feed.unpin',
      actor: writer.auditActor,
      targetUserId: auditTarget(post),
      data: { postId: post.id },
    });
    return { pinned: await pinnedGroup(tx), changed: true };
  });
  if (outcome.changed) await feedEvents.pins();
  return { pinned: outcome.pinned, unpinned: null };
}

export const feedPinService = { pin, unpin };
