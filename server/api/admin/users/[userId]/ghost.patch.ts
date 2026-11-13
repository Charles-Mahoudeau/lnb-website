import { defineEventHandler } from 'nuxt/server';

import { ghostService } from '~~/server/services/ghosts';

import { adminGhostUpdateBody, adminUserParams } from '#shared/schemas/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { userId } = parseParams(event, adminUserParams);
  const body = await parseBody(event, adminGhostUpdateBody);
  return ghostService.update({ actorId: admin.id, userId, body });
});
