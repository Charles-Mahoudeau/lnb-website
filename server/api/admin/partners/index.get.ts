import { defineEventHandler } from 'nuxt/server';

import { partnerService } from '~~/server/services/partners';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return partnerService.listAdmin();
});
