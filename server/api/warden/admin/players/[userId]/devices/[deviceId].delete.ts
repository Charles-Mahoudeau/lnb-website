import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenDeviceService } from '~~/server/services/warden/devices';

import { wardenUserDeviceParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { userId, deviceId } = parseParams(event, wardenUserDeviceParams);
  await wardenDeviceService.revokeOrFail({
    deviceId,
    userId,
    actor: { source: 'web', userId: admin.id },
  });
  setResponseStatus(event, 204);
  return null;
});
