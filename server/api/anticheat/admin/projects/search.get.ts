import { defineEventHandler } from 'nuxt/server';

import { anticheatSearchService } from '~~/server/services/anticheat/search';

import { anticheatProjectSearchQuery } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { q, kind } = parseQuery(event, anticheatProjectSearchQuery);
  return {
    items: await anticheatSearchService.searchProjects({ adminId: admin.id, query: q, kind }),
  };
});
