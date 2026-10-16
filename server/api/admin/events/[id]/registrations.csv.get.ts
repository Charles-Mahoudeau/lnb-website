import { defineEventHandler } from 'nuxt/server';

import { eventRegistrationService } from '~~/server/services/events/registrations';

import { eventIdParams } from '#shared/schemas/events';

// Emails are in it: managers only, and never cached.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  return new Response(await eventRegistrationService.csv(id), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="registrations-${id}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
