import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedNotificationService } from '~~/server/services/feed/notifications';

import { feedAckBody } from '#shared/schemas/feed';

// Delivered notifications: deletes them. Unknown IDs are ignored.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  const { ids } = await parseBody(event, feedAckBody);
  await feedNotificationService.ack(ids);
  setResponseStatus(event, 204);
  return null;
});
