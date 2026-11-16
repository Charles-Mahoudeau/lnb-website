import { defineEventHandler } from 'nuxt/server';

import { modpackExportService } from '~~/server/services/modpack/export';

import { modpackExportQuery } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { mode } = parseQuery(event, modpackExportQuery);
  return modpackExportService.preview(mode);
});
