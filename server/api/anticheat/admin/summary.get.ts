import { defineEventHandler } from 'nuxt/server';

import { anticheatAlertService } from '~~/server/services/anticheat/alerts';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return anticheatAlertService.summary();
});
