import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamUserParams } from '#shared/schemas/team';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { userId } = parseParams(event, teamUserParams);
  await teamService.removeMember({ actorId: admin.id, userId });
  setResponseStatus(event, 204);
  return null;
});
