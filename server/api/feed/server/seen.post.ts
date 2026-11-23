import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedReadStateService } from '~~/server/services/feed/read-state';

import { feedServerSeenBody } from '#shared/schemas/feed';

// A player viewed a feed up to a post: its unread dot clears. A guest's call does nothing.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  const { player, feed, upTo } = await parseBody(event, feedServerSeenBody);
  await feedReadStateService.markFeedSeen({ player }, feed, new Date(upTo));
  setResponseStatus(event, 204);
  return null;
});
