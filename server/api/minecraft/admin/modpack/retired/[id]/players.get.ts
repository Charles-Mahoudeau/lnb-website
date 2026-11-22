import { defineEventHandler } from 'nuxt/server';

import { modpackRetiredService } from '~~/server/services/modpack/retired';

import { modpackIdParams } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { id } = parseParams(event, modpackIdParams);
  return modpackRetiredService.players(id);
});
