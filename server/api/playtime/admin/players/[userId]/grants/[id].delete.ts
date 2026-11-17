import { createError, defineEventHandler } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';
import { playtimeAdminViewService } from '~~/server/services/playtime/admin-view';

import { playtimeUserItemParams } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  const granter = await requirePlaytimeGranter(event);
  const { userId, id } = parseParams(event, playtimeUserItemParams);
  await playtimeAdminService.revokeGrant({ source: 'web', userId: granter.id }, userId, id);
  const player = await playtimeAdminViewService.player(userId);
  if (!player) throw createError({ status: 404, statusText: 'Not Found' });
  return player;
});
