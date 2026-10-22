import { defineEventHandler } from 'nuxt/server';

import { wardenClientService } from '~~/server/services/warden/client';

export default defineEventHandler(async (event) => {
  const client = await requireWardenClient(event);
  await requireFlag(event, 'warden.clientApi');
  return wardenClientService.me(client);
});
