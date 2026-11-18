import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';

import { playtimeResetBody } from '#shared/schemas/playtime';

// Site admins only: the counted time and the warnings, for everyone.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { confirm } = await parseBody(event, playtimeResetBody);
  await playtimeAdminService.reset({ source: 'web', userId: admin.id }, confirm);
  setResponseStatus(event, 204);
  return null;
});
