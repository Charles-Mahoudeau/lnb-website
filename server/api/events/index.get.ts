import { defineEventHandler } from 'nuxt/server';

import { eventPublicService } from '~~/server/services/events/public';

import { eventQuery } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  await requireFlag(event, 'events');
  const query = parseQuery(event, eventQuery);
  const session = await getAuthSession(event);
  return { items: await eventPublicService.list(query, { userId: session?.user.id ?? null }) };
});
