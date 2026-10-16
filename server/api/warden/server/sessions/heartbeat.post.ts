import { defineEventHandler } from 'nuxt/server';

import { wardenSessionService } from '~~/server/services/warden/sessions';

import { wardenHeartbeatBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'warden.serverApi');
  const { sessionIds } = await parseBody(event, wardenHeartbeatBody);
  return wardenSessionService.heartbeat(sessionIds);
});
