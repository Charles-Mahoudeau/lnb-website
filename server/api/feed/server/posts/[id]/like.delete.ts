import { defineEventHandler } from 'nuxt/server';

import { feedLikeService } from '~~/server/services/feed/likes';

import { feedIdParams, feedPlayerQuery } from '#shared/schemas/feed';

// Unlikes a post or reply for a player. Unliking again changes nothing.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  await requireFlag(event, 'feed.writing');
  const { id } = parseParams(event, feedIdParams);
  const { player } = parseQuery(event, feedPlayerQuery);
  return withRetryAfter(
    event,
    feedLikeService.setLiked({ actor: { source: 'server', player }, postId: id, liked: false }),
  );
});
