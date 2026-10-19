import { defineEventHandler } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamUserQuery } from '#shared/schemas/team';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const { q } = parseQuery(event, teamUserQuery);
  return { items: await teamService.searchUsers(q) };
});
