import { defineEventHandler } from 'nuxt/server';

import { wardenManualLinkService } from '~~/server/services/warden/manual-links';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return wardenManualLinkService.recent();
});
