import { defineEventHandler } from 'nuxt/server';

import { modpackExportService } from '~~/server/services/modpack/export';

import { modpackExportBody } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const body = await parseBody(event, modpackExportBody);
  return modpackExportService.apply({ ...body, actor: { source: 'web', userId: admin.id } });
});
