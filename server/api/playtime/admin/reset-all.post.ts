import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';

import { playtimeResetAllBody } from '#shared/schemas/playtime';

// Site admins only: the sessions, the total played time and everything the reset also wipes.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { confirm } = await parseBody(event, playtimeResetAllBody);
  await playtimeAdminService.resetAll({ source: 'web', userId: admin.id }, confirm);
  setResponseStatus(event, 204);
  return null;
});
