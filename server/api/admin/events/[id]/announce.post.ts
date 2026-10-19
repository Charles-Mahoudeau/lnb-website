import { defineEventHandler } from 'nuxt/server';

import { eventPushService } from '~~/server/services/events/push';

import { eventIdParams } from '#shared/schemas/events';

// Sends the new-event notification, once. Ask for the impact first, to confirm it.
export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  return eventPushService.announce({ actorId: manager.id, id });
});
