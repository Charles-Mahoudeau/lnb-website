import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamPoleBody } from '#shared/schemas/team';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await parseBody(event, teamPoleBody);
  const created = await teamService.createPole({ actorId: admin.id, body });
  setResponseStatus(event, 201);
  return created;
});
