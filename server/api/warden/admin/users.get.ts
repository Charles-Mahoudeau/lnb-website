import { defineEventHandler } from 'nuxt/server';

import { wardenManualLinkService } from '~~/server/services/warden/manual-links';

import { wardenUserSearchQuery } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return wardenManualLinkService.searchUsers(parseQuery(event, wardenUserSearchQuery).q);
});
