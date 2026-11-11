import { defineEventHandler } from 'nuxt/server';

import { eventTeamInviteService } from '~~/server/services/events/team-invites';

import { eventPlayerSearchQuery } from '#shared/schemas/event-teams';
import { eventIdParams } from '#shared/schemas/events';

// Finds players to invite: by name or email, 3 characters at least. Signed in only, since it
// shows emails. People already in a team, banned accounts and other schools are left out.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.teams');
  const { id } = parseParams(event, eventIdParams);
  const query = parseQuery(event, eventPlayerSearchQuery);
  return {
    items: await eventTeamInviteService.search({
      eventId: id,
      userId: user.id,
      q: query.q,
      teamId: query.teamId,
    }),
  };
});
