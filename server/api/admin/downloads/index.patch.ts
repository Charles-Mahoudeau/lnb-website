import { defineEventHandler } from 'nuxt/server';

import { downloadService } from '~~/server/services/downloads';

import { downloadSettingsBody } from '#shared/schemas/downloads';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const body = await parseBody(event, downloadSettingsBody);
  return downloadService.updateSettings({ body, actorId: admin.id });
});
