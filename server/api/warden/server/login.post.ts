import { defineEventHandler } from 'nuxt/server';

import { wardenSessionService } from '~~/server/services/warden/sessions';

import { wardenLoginBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'warden.serverApi');
  return wardenSessionService.login(await parseBody(event, wardenLoginBody));
});
