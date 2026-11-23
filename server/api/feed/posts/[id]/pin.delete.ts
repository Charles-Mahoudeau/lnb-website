import { defineEventHandler } from 'nuxt/server';

import { feedPinService } from '~~/server/services/feed/pins';

import { feedIdParams } from '#shared/schemas/feed';

// Unpins an announcement. Announcers. Not behind writing.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  const { id } = parseParams(event, feedIdParams);
  return feedPinService.unpin({ actor: { source: 'site', userId: user.id }, postId: id });
});
