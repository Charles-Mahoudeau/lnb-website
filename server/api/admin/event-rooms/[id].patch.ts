import { defineEventHandler } from 'nuxt/server';

import { eventRoomService } from '~~/server/services/events/rooms';

import { eventIdParams, eventRoomPatchBody } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  const patch = await parseBody(event, eventRoomPatchBody);
  return eventRoomService.update({ actorId: manager.id, id, patch });
});
