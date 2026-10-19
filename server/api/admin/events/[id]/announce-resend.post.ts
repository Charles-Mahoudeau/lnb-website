import { defineEventHandler } from 'nuxt/server';

import { eventPushService } from '~~/server/services/events/push';

import { eventIdParams } from '#shared/schemas/events';

// Sends the new-event notification again, to everyone it concerns. Ask for the impact first.
export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  return eventPushService.announce({ actorId: manager.id, id, resend: true });
});
