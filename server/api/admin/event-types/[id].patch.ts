import { defineEventHandler } from 'nuxt/server';

import { eventTypeService } from '~~/server/services/events/types';

import { eventIdParams, eventTypePatchBody } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  const patch = await parseBody(event, eventTypePatchBody);
  return eventTypeService.update({ actorId: manager.id, id, patch });
});
