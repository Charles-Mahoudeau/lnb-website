import { defineEventHandler } from 'nuxt/server';

import { adminWeekService } from '~~/server/services/admin-week';

export default defineEventHandler(async (event) => {
  const viewer = await requirePeople(event);
  return adminWeekService.week(viewer.role);
});
