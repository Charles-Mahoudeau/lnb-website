import { defineEventHandler } from 'nuxt/server';

import { feedPinService } from '~~/server/services/feed/pins';

import { feedIdParams, feedPinBodyOrNone } from '#shared/schemas/feed';

// Pins an announcement, replacing the oldest pin when asked. Announcers. Not behind writing.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  const { id } = parseParams(event, feedIdParams);
  const body = await parseBody(event, feedPinBodyOrNone);
  return feedPinService.pin({
    actor: { source: 'site', userId: user.id },
    postId: id,
    replace: body?.replace,
  });
});
