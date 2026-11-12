import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

import { anticheatProjectCreateBody } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const body = await parseBody(event, anticheatProjectCreateBody);
  setResponseStatus(event, 201);
  return anticheatAdminService.createProject({ actor: { source: 'web', userId: admin.id }, body });
});
