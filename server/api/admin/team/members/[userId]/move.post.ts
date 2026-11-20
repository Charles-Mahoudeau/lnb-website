import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamMoveBody, teamUserParams } from '#shared/schemas/team';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { userId } = parseParams(event, teamUserParams);
  const { direction } = await parseBody(event, teamMoveBody);
  await teamService.moveMember({ actorId: admin.id, userId, direction });
  setResponseStatus(event, 204);
  return null;
});
