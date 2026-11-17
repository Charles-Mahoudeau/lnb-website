import { createError, defineEventHandler } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';
import { playtimeAdminViewService } from '~~/server/services/playtime/admin-view';

import { playtimeUserItemParams } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { userId, id } = parseParams(event, playtimeUserItemParams);
  await playtimeAdminService.revokeExemption({ source: 'web', userId: admin.id }, id, userId);
  const player = await playtimeAdminViewService.player(userId);
  if (!player) throw createError({ status: 404, statusText: 'Not Found' });
  return player;
});
