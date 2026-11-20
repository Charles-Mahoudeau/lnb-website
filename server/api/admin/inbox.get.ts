import { defineEventHandler } from 'nuxt/server';

import { adminInboxService } from '~~/server/services/admin-inbox';

export default defineEventHandler(async (event) => {
  const viewer = await requirePeople(event);
  return adminInboxService.inbox(viewer.role);
});
