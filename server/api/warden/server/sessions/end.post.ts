import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenSessionService } from '~~/server/services/warden/sessions';

import { wardenSessionEndBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await wardenSessionService.end(await parseBody(event, wardenSessionEndBody));
  setResponseStatus(event, 204);
  return null;
});
