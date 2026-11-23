import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedReadStateService } from '~~/server/services/feed/read-state';

import { feedSeenBody } from '#shared/schemas/feed';

// The person viewed a feed up to a post: its unread dot clears.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  const { feed, upTo } = await parseBody(event, feedSeenBody);
  await feedReadStateService.markFeedSeen({ userId: user.id }, feed, new Date(upTo));
  setResponseStatus(event, 204);
  return null;
});
