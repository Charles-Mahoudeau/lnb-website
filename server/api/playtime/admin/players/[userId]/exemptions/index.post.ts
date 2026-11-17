import { createError, defineEventHandler, setResponseStatus } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';
import { playtimeAdminViewService } from '~~/server/services/playtime/admin-view';

import { playtimePlayerExemptionBody, playtimeUserParams } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { userId } = parseParams(event, playtimeUserParams);
  const body = await parseBody(event, playtimePlayerExemptionBody);
  await playtimeAdminService.addExemption(
    { source: 'web', userId: admin.id },
    body.minecraftUuid
      ? { minecraftUuid: body.minecraftUuid, reason: body.reason, until: body.until }
      : { userId, reason: body.reason, until: body.until },
    userId,
  );
  setResponseStatus(event, 201);
  const player = await playtimeAdminViewService.player(userId);
  if (!player) throw createError({ status: 404, statusText: 'Not Found' });
  return player;
});
