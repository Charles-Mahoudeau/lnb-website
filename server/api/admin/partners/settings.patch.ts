import { defineEventHandler } from 'nuxt/server';

import { partnerService } from '~~/server/services/partners';

import { partnerSettingsBody } from '#shared/schemas/partners';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const settings = await parseBody(event, partnerSettingsBody);
  await partnerService.setSettings({ actorId: admin.id, settings });
  return settings;
});
