import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamIdParams, teamPolePatchBody } from '#shared/schemas/team';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { id } = parseParams(event, teamIdParams);
  const patch = await parseBody(event, teamPolePatchBody);
  await teamService.updatePole({ actorId: admin.id, id, patch });
  setResponseStatus(event, 204);
  return null;
});
