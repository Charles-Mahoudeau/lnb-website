import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { ghostService } from '~~/server/services/ghosts';

import { adminGhostBody } from '#shared/schemas/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  await requireFlag(event, 'ghostAccounts');
  const body = await parseBody(event, adminGhostBody);
  const ghost = await ghostService.create({ actorId: admin.id, body });
  setResponseStatus(event, 201);
  return ghost;
});
