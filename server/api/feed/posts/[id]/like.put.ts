import { defineEventHandler } from 'nuxt/server';

import { feedLikeService } from '~~/server/services/feed/likes';

import { feedIdParams } from '#shared/schemas/feed';

// Likes a post or reply. Liking again changes nothing.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  await requireFlag(event, 'feed.writing');
  const { id } = parseParams(event, feedIdParams);
  return withRetryAfter(
    event,
    feedLikeService.setLiked({
      actor: { source: 'site', userId: user.id },
      postId: id,
      liked: true,
    }),
  );
});
