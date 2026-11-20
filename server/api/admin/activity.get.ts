import { defineEventHandler } from 'nuxt/server';

import { activityService } from '~~/server/services/activity';

import { adminActivityQuery } from '#shared/schemas/admin';

// What each role may read is cut by the service (docs/activity-log.md).
export default defineEventHandler(async (event) => {
  const viewer = await requirePeople(event);
  const { cursor, ...filters } = parseQuery(event, adminActivityQuery);
  return activityService.page(viewer.role, filters, { cursor });
});
