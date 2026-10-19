import { defineEventHandler } from 'nuxt/server';

import { eventPushService } from '~~/server/services/events/push';

import { eventIdParams } from '#shared/schemas/events';
import { pushImpactBody } from '#shared/schemas/push';

// How many people an action would notify, for the confirmation. Writes nothing.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  const body = await parseBody(event, pushImpactBody);
  return eventPushService.impact(id, body);
});
