import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamIdParams } from '#shared/schemas/team';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { id } = parseParams(event, teamIdParams);
  await teamService.deletePole({ actorId: admin.id, id });
  setResponseStatus(event, 204);
  return null;
});
