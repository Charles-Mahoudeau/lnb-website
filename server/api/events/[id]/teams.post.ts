import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTeamService } from '~~/server/services/events/teams';

import { eventTeamCreateBody } from '#shared/schemas/event-teams';
import { eventIdParams } from '#shared/schemas/events';

// Creates a team with the caller as captain. They must be registered to the event.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  await requireFlag(event, 'events.teams');
  const { id } = parseParams(event, eventIdParams);
  const body = await parseBody(event, eventTeamCreateBody);
  const { id: teamId } = await eventTeamService.create({
    userId: user.id,
    eventId: id,
    name: body.name,
  });
  setResponseStatus(event, 201);
  return { id: teamId };
});
