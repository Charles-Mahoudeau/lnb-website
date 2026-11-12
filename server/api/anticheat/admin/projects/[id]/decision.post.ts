import { defineEventHandler } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

import { anticheatDecisionBody, anticheatProjectParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, anticheatProjectParams);
  const body = await parseBody(event, anticheatDecisionBody);
  return anticheatAdminService.decideProject({
    actor: { source: 'web', userId: admin.id },
    projectId: id,
    body,
  });
});
