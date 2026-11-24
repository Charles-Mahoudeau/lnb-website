import { defineEventHandler } from 'nuxt/server';

import { feedPinService } from '~~/server/services/feed/pins';

import { feedIdParams, feedPlayerQuery } from '#shared/schemas/feed';

// Unpins an announcement. Not behind writing.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  const { id } = parseParams(event, feedIdParams);
  const { player } = parseQuery(event, feedPlayerQuery);
  return feedPinService.unpin({ actor: { source: 'server', player }, postId: id });
});
