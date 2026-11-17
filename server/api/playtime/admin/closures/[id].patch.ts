import { defineEventHandler } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';

import { playtimeClosureBody, playtimeClosureParams } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, playtimeClosureParams);
  const body = await parseBody(event, playtimeClosureBody);
  await playtimeAdminService.updateClosure({ source: 'web', userId: admin.id }, id, body);
  return playtimeAdminService.closures();
});
