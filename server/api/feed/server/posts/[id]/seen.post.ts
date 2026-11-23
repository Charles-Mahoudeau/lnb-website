import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedReadStateService } from '~~/server/services/feed/read-state';

import { feedIdParams, feedPlayerBody } from '#shared/schemas/feed';

// A player opened a thread: its unseen-replies markers clear. A guest's call does nothing.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  const { id } = parseParams(event, feedIdParams);
  const { player } = await parseBody(event, feedPlayerBody);
  await feedReadStateService.markThreadSeen({ player }, id);
  setResponseStatus(event, 204);
  return null;
});
