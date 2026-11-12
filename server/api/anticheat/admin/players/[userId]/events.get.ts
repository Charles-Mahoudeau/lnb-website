import { defineEventHandler } from 'nuxt/server';

import { anticheatRosterService } from '~~/server/services/anticheat/roster';

import { anticheatEventsQuery, anticheatPlayerParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { userId } = parseParams(event, anticheatPlayerParams);
  const { cursor } = parseQuery(event, anticheatEventsQuery);
  return anticheatRosterService.events(userId, cursor);
});
