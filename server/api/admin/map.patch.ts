import { defineEventHandler } from 'nuxt/server';

import { mapService } from '~~/server/services/map';

import { mapSettingsBody } from '#shared/schemas/map';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { url } = await parseBody(event, mapSettingsBody);
  return mapService.setUrl({ actorId: admin.id, url });
});
