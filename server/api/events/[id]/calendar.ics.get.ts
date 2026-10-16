import { defineEventHandler } from 'nuxt/server';

import { eventPublicService } from '~~/server/services/events/public';

import { eventIdParams } from '#shared/schemas/events';
import { isEventsManager } from '#shared/utils/roles';

export default defineEventHandler(async (event) => {
  await requireFlag(event, 'events');
  const { id } = parseParams(event, eventIdParams);
  const session = await getAuthSession(event);
  const ics = await eventPublicService.calendar(id, isEventsManager(session?.user.role));
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="lnb-event-${id}.ics"`,
      'Cache-Control': 'no-cache',
    },
  });
});
