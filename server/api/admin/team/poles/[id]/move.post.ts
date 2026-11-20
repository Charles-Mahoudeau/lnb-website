import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamIdParams, teamMoveBody } from '#shared/schemas/team';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { id } = parseParams(event, teamIdParams);
  const { direction } = await parseBody(event, teamMoveBody);
  await teamService.movePole({ actorId: admin.id, id, direction });
  setResponseStatus(event, 204);
  return null;
});
