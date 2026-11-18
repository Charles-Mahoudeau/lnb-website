import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

import { anticheatResetBody } from '#shared/schemas/anticheat';

// Site admins only: the decisions on files, the notes and the banned mod IDs.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { confirm } = await parseBody(event, anticheatResetBody);
  await anticheatAdminService.resetFiles({ source: 'web', userId: admin.id }, confirm);
  setResponseStatus(event, 204);
  return null;
});
