import { createError, defineEventHandler } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';
import { playtimeAdminViewService } from '~~/server/services/playtime/admin-view';

import { playtimePlayerOverridesBody, playtimeUserParams } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { userId } = parseParams(event, playtimeUserParams);
  const body = await parseBody(event, playtimePlayerOverridesBody);
  await playtimeAdminService.setPlayerOverrides({ source: 'web', userId: admin.id }, userId, body);
  const player = await playtimeAdminViewService.player(userId);
  if (!player) throw createError({ status: 404, statusText: 'Not Found' });
  return player;
});
