import { defineEventHandler } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

import { anticheatBulkBody, anticheatFileParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { sha512 } = parseParams(event, anticheatFileParams);
  const body = await parseBody(event, anticheatBulkBody);
  return anticheatAdminService.bulkPlayers({
    actor: { source: 'web', userId: admin.id },
    sha512,
    body,
  });
});
