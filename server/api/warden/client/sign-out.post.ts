import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenClientService } from '~~/server/services/warden/client';

export default defineEventHandler(async (event) => {
  const client = await requireWardenClient(event);
  await requireFlag(event, 'warden.clientApi');
  await wardenClientService.signOut(client);
  setResponseStatus(event, 204);
  return null;
});
