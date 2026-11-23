import { and, eq, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { feedLike, feedPost } from '~~/server/db/schema';

import { feedEvents } from './events';
import { feedRightsService } from './rights';
import { feedLimits, livePost, refuse, requireWriting } from './shared';
import type { FeedActor } from './shared';

import type { FeedLikeResult } from '#shared/schemas/feed';

// Likes (docs/feed-mod.md 4.7): one per LNB account and post, whatever Minecraft account it was
// given from. Liking a liked post, or unliking one that isn't, changes nothing. The count is kept
// in the transaction that likes or unlikes.

async function setLiked(input: {
  actor: FeedActor;
  postId: string;
  liked: boolean;
}): Promise<FeedLikeResult> {
  await requireWriting();
  const writer = await feedRightsService.writer(db, input.actor, 'linked');
  if (writer.person.banned) refuse(403, 'banned');
  await livePost(db, input.postId);
  await feedLimits.check('like', writer.userId);
  const { likes, changed } = await db.transaction(async (tx) => {
    const post = await livePost(tx, input.postId, true);
    const changedRows = input.liked
      ? await tx
          .insert(feedLike)
          .values({ postId: post.id, userId: writer.userId, createdAt: new Date() })
          .onConflictDoNothing()
          .returning({ postId: feedLike.postId })
      : await tx
          .delete(feedLike)
          .where(and(eq(feedLike.postId, post.id), eq(feedLike.userId, writer.userId)))
          .returning({ postId: feedLike.postId });
    if (!changedRows.length) return { likes: post.likeCount, changed: false };
    const [updated] = await tx
      .update(feedPost)
      .set({
        likeCount: input.liked
          ? sql`${feedPost.likeCount} + 1`
          : sql`greatest(${feedPost.likeCount} - 1, 0)`,
      })
      .where(eq(feedPost.id, post.id))
      .returning({ likes: feedPost.likeCount });
    return { likes: updated!.likes, changed: true };
  });
  if (changed) await feedEvents.counts([input.postId]);
  return { id: input.postId, likes, liked: input.liked };
}

export const feedLikeService = { setLiked };
