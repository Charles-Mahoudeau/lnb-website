import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamMemberPatchBody, teamUserParams } from '#shared/schemas/team';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { userId } = parseParams(event, teamUserParams);
  const patch = await parseBody(event, teamMemberPatchBody);
  await teamService.updateMember({ actorId: admin.id, userId, patch });
  setResponseStatus(event, 204);
  return null;
});
