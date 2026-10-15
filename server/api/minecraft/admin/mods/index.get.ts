import { defineEventHandler } from 'nuxt/server';

import { modAdminService } from '~~/server/services/mods/admin';

import { modAdminQuery } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const query = parseQuery(event, modAdminQuery);
  return { items: await modAdminService.list(query) };
});
