import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedReadStateService } from '~~/server/services/feed/read-state';

import { feedIdParams } from '#shared/schemas/feed';

// The person opened a thread: its unseen-replies markers clear.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  const { id } = parseParams(event, feedIdParams);
  await feedReadStateService.markThreadSeen({ userId: user.id }, id);
  setResponseStatus(event, 204);
  return null;
});
