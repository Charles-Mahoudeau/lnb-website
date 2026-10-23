import { defineEventHandler } from 'nuxt/server';

import { shortLinkService } from '~~/server/services/short-links';

import { shortLinkIdParams } from '#shared/schemas/short-links';

// Names and emails, so it is logged. Not cached anywhere.
export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, shortLinkIdParams);
  const { name, csv } = await shortLinkService.exportClicks({ actorId: manager.id, id });
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
});
