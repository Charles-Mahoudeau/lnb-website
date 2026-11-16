import { defineEventHandler } from 'nuxt/server';

import { fileService } from '~~/server/services/files';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return fileService.list();
});
