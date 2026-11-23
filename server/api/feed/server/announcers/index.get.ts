import { defineEventHandler } from 'nuxt/server';

import { feedAnnouncerService } from '~~/server/services/feed/announcers';

// `/feed announcer list`: the people with the role (moderators announce by role, not listed).
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  return feedAnnouncerService.list();
});
