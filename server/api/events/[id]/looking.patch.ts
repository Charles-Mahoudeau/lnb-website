import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTeamService } from '~~/server/services/events/teams';

import { eventLookingBody } from '#shared/schemas/event-teams';
import { eventIdParams } from '#shared/schemas/events';

// Shows or hides the caller in the list of players looking for a team.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  const { id } = parseParams(event, eventIdParams);
  const body = await parseBody(event, eventLookingBody);
  await eventTeamService.setLookingHidden({ userId: user.id, eventId: id, hidden: body.hidden });
  setResponseStatus(event, 204);
  return null;
});
