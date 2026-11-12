import { defineEventHandler } from 'nuxt/server';

import { anticheatTrustService } from '~~/server/services/anticheat/trust';

import { anticheatEventsBody } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'anticheat.serverApi');
  return anticheatTrustService.serverEvents(await parseBody(event, anticheatEventsBody));
});
