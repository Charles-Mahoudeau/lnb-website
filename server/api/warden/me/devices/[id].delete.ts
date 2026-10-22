import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenDeviceService } from '~~/server/services/warden/devices';

import { wardenIdParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'warden.linking');
  const { id } = parseParams(event, wardenIdParams);
  await wardenDeviceService.revokeOrFail({
    deviceId: id,
    userId: user.id,
    actor: { source: 'web', userId: user.id },
  });
  setResponseStatus(event, 204);
  return null;
});
