import { defineEventHandler } from 'nuxt/server';

import { wardenAdminService } from '~~/server/services/warden/admin';

import { wardenPlayersQuery } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return wardenAdminService.players(parseQuery(event, wardenPlayersQuery));
});
