import { defineEventHandler } from 'nuxt/server';

import { anticheatRosterService } from '~~/server/services/anticheat/roster';

import { anticheatPlayersQuery } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return anticheatRosterService.players(parseQuery(event, anticheatPlayersQuery));
});
