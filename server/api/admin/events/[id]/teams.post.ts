import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { adminTeamService } from '~~/server/services/events/admin-teams';

import { adminTeamCreateBody } from '#shared/schemas/event-teams';
import { eventIdParams } from '#shared/schemas/events';

// A manager makes a team, with or without a first player.
export default defineEventHandler(async (event) => {
  const actor = await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  const body = await parseBody(event, adminTeamCreateBody);
  const created = await adminTeamService.create({
    actorId: actor.id,
    eventId: id,
    name: body.name,
    userId: body.userId,
    captain: body.captain,
  });
  setResponseStatus(event, 201);
  return created;
});
