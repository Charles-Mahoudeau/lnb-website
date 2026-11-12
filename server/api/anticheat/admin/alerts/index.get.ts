import { defineEventHandler } from 'nuxt/server';

import { anticheatAlertService } from '~~/server/services/anticheat/alerts';

import { anticheatAlertsQuery } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { cursor } = parseQuery(event, anticheatAlertsQuery);
  return anticheatAlertService.list(cursor);
});
