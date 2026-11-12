import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

import { anticheatModIdBanBody } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { modId, reason } = await parseBody(event, anticheatModIdBanBody);
  await anticheatAdminService.banModId({
    actor: { source: 'web', userId: admin.id },
    modId,
    reason,
  });
  setResponseStatus(event, 201);
  return anticheatAdminService.modIdBans();
});
