import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenAdminService } from '~~/server/services/warden/admin';

import { wardenPlayerPatchBody, wardenUserParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { userId } = parseParams(event, wardenUserParams);
  const { maxAccounts } = await parseBody(event, wardenPlayerPatchBody);
  await wardenAdminService.setMaxAccounts({
    userId,
    maxAccounts,
    actor: { source: 'web', userId: admin.id },
  });
  setResponseStatus(event, 204);
  return null;
});
