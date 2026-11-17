import { defineEventHandler } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';

import { playtimeClosureParams } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, playtimeClosureParams);
  await playtimeAdminService.deleteClosure({ source: 'web', userId: admin.id }, id);
  return playtimeAdminService.closures();
});
