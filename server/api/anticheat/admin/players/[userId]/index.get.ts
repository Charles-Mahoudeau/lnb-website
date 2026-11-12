import { defineEventHandler } from 'nuxt/server';

import { anticheatRosterService } from '~~/server/services/anticheat/roster';

import { anticheatPlayerParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { userId } = parseParams(event, anticheatPlayerParams);
  return anticheatRosterService.player(userId);
});
