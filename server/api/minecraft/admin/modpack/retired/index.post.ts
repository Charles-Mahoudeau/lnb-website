import { defineEventHandler } from 'nuxt/server';

import { modpackRetiredService } from '~~/server/services/modpack/retired';

import { modpackRetiredAddBody } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const body = await parseBody(event, modpackRetiredAddBody);
  return modpackRetiredService.add({ body, actor: { source: 'web', userId: admin.id } });
});
