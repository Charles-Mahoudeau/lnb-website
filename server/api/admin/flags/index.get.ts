import { defineEventHandler } from 'nuxt/server';

import { flagService } from '~~/server/services/flags';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return { items: await flagService.list() };
});
