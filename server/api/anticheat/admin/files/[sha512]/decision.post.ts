import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

import { anticheatDecisionBody, anticheatFileParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { sha512 } = parseParams(event, anticheatFileParams);
  const body = await parseBody(event, anticheatDecisionBody);
  await anticheatAdminService.decideFile({
    actor: { source: 'web', userId: admin.id },
    sha512,
    body,
  });
  setResponseStatus(event, 204);
  return null;
});
