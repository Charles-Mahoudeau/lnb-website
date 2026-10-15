import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenAdminService } from '~~/server/services/warden/admin';

import { wardenRoleBody, wardenUserParams } from '#shared/schemas/warden';

// Site admins only: Warden admins can't make more Warden admins.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { userId } = parseParams(event, wardenUserParams);
  const { wardenAdmin } = await parseBody(event, wardenRoleBody);
  await wardenAdminService.setWardenAdmin({
    userId,
    on: wardenAdmin,
    actor: { source: 'web', userId: admin.id },
  });
  setResponseStatus(event, 204);
  return null;
});
