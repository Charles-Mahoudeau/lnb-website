import { defineEventHandler } from 'nuxt/server';

import { anticheatReportService } from '~~/server/services/anticheat/reports';

import { anticheatSessionParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'anticheat.serverApi');
  return anticheatReportService.current(parseParams(event, anticheatSessionParams).sessionId);
});
