import { defineEventHandler } from 'nuxt/server';

import { activityService } from '~~/server/services/activity';

import { adminActivityFilters } from '#shared/schemas/admin';

// The same filters as the list, for site admins, newest first and capped. Names are in it.
export default defineEventHandler(async (event) => {
  const viewer = await requireAdmin(event);
  const filters = parseQuery(event, adminActivityFilters);
  return new Response(await activityService.csv(viewer.role, filters), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="activity.csv"',
      'Cache-Control': 'no-store',
    },
  });
});
