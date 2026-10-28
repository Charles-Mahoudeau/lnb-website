import { defineEventHandler } from 'nuxt/server';

import { eventAdminService } from '~~/server/services/events/admin';

import { eventAdminQuery } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  await requireAccess(event, { permission: 'events:read-hidden', user: requireEventsManager });
  const query = parseQuery(event, eventAdminQuery);
  return { items: await eventAdminService.list(query) };
});
