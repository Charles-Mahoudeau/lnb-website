import { defineEventHandler } from 'nuxt/server';

import { feedPinService } from '~~/server/services/feed/pins';

import { feedIdParams, feedServerPinBody } from '#shared/schemas/feed';

// Pins an announcement, replacing the oldest pin when asked. Not behind writing.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  const { id } = parseParams(event, feedIdParams);
  const { player, replace } = await parseBody(event, feedServerPinBody);
  return feedPinService.pin({ actor: { source: 'server', player }, postId: id, replace });
});
