import { defineEventHandler } from 'nuxt/server';

import { partnerEventAdminService } from '~~/server/services/partner-events-admin';

import { partnerEventParams } from '#shared/schemas/partner-events';

// Names, emails and dates of birth, so it is logged. Not cached anywhere.
export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { slug } = parseParams(event, partnerEventParams);
  const bytes = await partnerEventAdminService.exportSheet({ actorId: manager.id, slug });
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${slug}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
});
