import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modAdminService } from '~~/server/services/mods/admin';

import { modAddBody } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const body = await parseBody(event, modAddBody);
  const created = await modAdminService.addOfficial({
    body,
    actor: { source: 'web', userId: admin.id },
  });
  setResponseStatus(event, 201);
  return created;
});
