import { defineEventHandler } from 'nuxt/server';

import { anticheatReportService } from '~~/server/services/anticheat/reports';

import { anticheatReportBody } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'anticheat.serverApi');
  return anticheatReportService.submit(await parseBody(event, anticheatReportBody));
});
