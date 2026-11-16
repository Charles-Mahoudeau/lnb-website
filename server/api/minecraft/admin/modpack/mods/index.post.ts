import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modpackService } from '~~/server/services/modpack';

import { modpackAddBody } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const body = await parseBody(event, modpackAddBody);
  const created = await modpackService.add({
    body,
    actor: { source: 'web', userId: admin.id },
  });
  setResponseStatus(event, 201);
  return created;
});
