import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { bdeSyncService } from '~~/server/services/events/bde';

import { eventIdParams } from '#shared/schemas/events';

// Pushes the event to the BDE website again now, such as after the BDE refused it.
export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  await bdeSyncService.retry(id, manager.id);
  setResponseStatus(event, 204);
  return null;
});
