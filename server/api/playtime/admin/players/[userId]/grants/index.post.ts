import { createError, defineEventHandler, setResponseStatus } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';
import { playtimeAdminViewService } from '~~/server/services/playtime/admin-view';

import { playtimeGrantBody, playtimeUserParams } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  const granter = await requirePlaytimeGranter(event);
  const { userId } = parseParams(event, playtimeUserParams);
  const body = await parseBody(event, playtimeGrantBody);
  await playtimeAdminService.addGrant({ source: 'web', userId: granter.id }, userId, body);
  setResponseStatus(event, 201);
  const player = await playtimeAdminViewService.player(userId);
  if (!player) throw createError({ status: 404, statusText: 'Not Found' });
  return player;
});
