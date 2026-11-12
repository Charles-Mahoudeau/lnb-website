import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

import { anticheatLinkBody, anticheatProjectParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, anticheatProjectParams);
  const { otherProjectId } = await parseBody(event, anticheatLinkBody);
  await anticheatAdminService.link({
    actor: { source: 'web', userId: admin.id },
    projectId: id,
    otherProjectId,
  });
  setResponseStatus(event, 204);
  return null;
});
