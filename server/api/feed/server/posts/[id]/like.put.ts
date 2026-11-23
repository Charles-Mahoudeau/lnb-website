import { defineEventHandler } from 'nuxt/server';

import { feedLikeService } from '~~/server/services/feed/likes';

import { feedIdParams, feedPlayerBody } from '#shared/schemas/feed';

// Likes a post or reply for a player. Liking again changes nothing.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  await requireFlag(event, 'feed.writing');
  const { id } = parseParams(event, feedIdParams);
  const { player } = await parseBody(event, feedPlayerBody);
  return withRetryAfter(
    event,
    feedLikeService.setLiked({ actor: { source: 'server', player }, postId: id, liked: true }),
  );
});
