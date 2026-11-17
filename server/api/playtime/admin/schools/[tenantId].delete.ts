import { defineEventHandler } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';

import { playtimeSchoolParams } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { tenantId } = parseParams(event, playtimeSchoolParams);
  await playtimeAdminService.clearSchool(
    { source: 'web', userId: admin.id },
    tenantId.toLowerCase(),
  );
  return playtimeAdminService.settings();
});
