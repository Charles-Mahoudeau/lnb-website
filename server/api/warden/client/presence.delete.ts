import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenPresenceService } from '~~/server/services/warden/presence';

export default defineEventHandler(async (event) => {
  const client = await requireWardenClient(event);
  await requireFlag(event, 'warden.clientApi');
  await wardenPresenceService.clear(client.device.id);
  setResponseStatus(event, 204);
  return null;
});
