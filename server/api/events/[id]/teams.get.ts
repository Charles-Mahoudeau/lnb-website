import { defineEventHandler } from 'nuxt/server';

import { eventTeamService } from '~~/server/services/events/teams';

import { eventIdParams } from '#shared/schemas/events';
import { isEventsManager } from '#shared/utils/roles';

// The teams of a tournament and the players looking for one. Names are for signed-in members.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'events');
  const { id } = parseParams(event, eventIdParams);
  const viewer = (await getAuthSession(event))?.user;
  return eventTeamService.view({
    eventId: id,
    userId: viewer?.id ?? null,
    canSeeDrafts: isEventsManager(viewer?.role),
  });
});
