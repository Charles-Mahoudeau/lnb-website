import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatTrustService } from '~~/server/services/anticheat/trust';

import { anticheatActionBody } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'anticheat.serverApi');
  await anticheatTrustService.recordAction(await parseBody(event, anticheatActionBody));
  setResponseStatus(event, 204);
  return null;
});
