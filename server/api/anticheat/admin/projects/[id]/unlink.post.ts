import { defineEventHandler } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

import { anticheatProjectParams, anticheatUnlinkBody } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, anticheatProjectParams);
  const { platform } = await parseBody(event, anticheatUnlinkBody);
  return anticheatAdminService.unlink({
    actor: { source: 'web', userId: admin.id },
    projectId: id,
    platform,
  });
});
