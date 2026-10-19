import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamMemberBody } from '#shared/schemas/team';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await parseBody(event, teamMemberBody);
  await teamService.addMember({ actorId: admin.id, body });
  setResponseStatus(event, 204);
  return null;
});
