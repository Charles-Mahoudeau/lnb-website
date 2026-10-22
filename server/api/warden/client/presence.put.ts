import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenPresenceService } from '~~/server/services/warden/presence';

import { wardenPresenceBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const client = await requireWardenClient(event);
  await requireFlag(event, 'warden.clientApi');
  await parseBody(event, wardenPresenceBody);
  await wardenPresenceService.set({ deviceId: client.device.id, userId: client.user.id });
  setResponseStatus(event, 204);
  return null;
});
