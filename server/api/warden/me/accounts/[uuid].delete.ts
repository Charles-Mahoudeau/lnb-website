import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenPlayerService } from '~~/server/services/warden/players';

import { wardenUuidParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'warden.linking');
  const { uuid } = parseParams(event, wardenUuidParams);
  await wardenPlayerService.unlink({
    userId: user.id,
    uuid,
    actor: { source: 'web', userId: user.id },
  });
  setResponseStatus(event, 204);
  return null;
});
