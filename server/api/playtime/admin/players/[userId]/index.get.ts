import { createError, defineEventHandler } from 'nuxt/server';

import { playtimeAdminViewService } from '~~/server/services/playtime/admin-view';

import { playtimeUserParams } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { userId } = parseParams(event, playtimeUserParams);
  const player = await playtimeAdminViewService.player(userId);
  if (!player) throw createError({ status: 404, statusText: 'Not Found' });
  return player;
});
