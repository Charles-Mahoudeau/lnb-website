import { defineEventHandler } from 'nuxt/server';

import { modRefreshService } from '~~/server/services/mods/refresh';

import { modIdParams } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { id } = parseParams(event, modIdParams);
  return modRefreshService.check(id);
});
