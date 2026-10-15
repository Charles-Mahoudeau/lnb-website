import { defineEventHandler } from 'nuxt/server';

import { wardenModerationService } from '~~/server/services/warden/moderation';

import { wardenAppealsQuery } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { status } = parseQuery(event, wardenAppealsQuery);
  return wardenModerationService.listAppeals(status);
});
