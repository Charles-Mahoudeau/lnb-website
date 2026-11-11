import { defineEventHandler } from 'nuxt/server';

import { adminTeamService } from '~~/server/services/events/admin-teams';

import { eventIdParams } from '#shared/schemas/events';

// The teams of a tournament with emails, and the registered players in no team. Managers only.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  return adminTeamService.view(id);
});
