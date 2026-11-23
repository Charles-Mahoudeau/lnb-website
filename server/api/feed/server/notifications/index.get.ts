import { defineEventHandler } from 'nuxt/server';

import { feedNotificationService } from '~~/server/services/feed/notifications';

// The notifications waiting for the Minecraft server, oldest first.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  return feedNotificationService.list();
});
