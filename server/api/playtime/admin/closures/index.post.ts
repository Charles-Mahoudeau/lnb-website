import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';

import { playtimeClosureBody } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const body = await parseBody(event, playtimeClosureBody);
  await playtimeAdminService.createClosure({ source: 'web', userId: admin.id }, body);
  setResponseStatus(event, 201);
  return playtimeAdminService.closures();
});
