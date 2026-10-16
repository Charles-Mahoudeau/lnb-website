import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventRoomService } from '~~/server/services/events/rooms';

import { eventRoomBody } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const body = await parseBody(event, eventRoomBody);
  const room = await eventRoomService.create({ actorId: manager.id, body });
  setResponseStatus(event, 201);
  return room;
});
