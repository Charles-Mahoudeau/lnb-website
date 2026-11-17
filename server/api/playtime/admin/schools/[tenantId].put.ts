import { defineEventHandler } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';

import { playtimeSchoolBody, playtimeSchoolParams } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { tenantId } = parseParams(event, playtimeSchoolParams);
  const body = await parseBody(event, playtimeSchoolBody);
  await playtimeAdminService.setSchool(
    { source: 'web', userId: admin.id },
    tenantId.toLowerCase(),
    body,
  );
  return playtimeAdminService.settings();
});
