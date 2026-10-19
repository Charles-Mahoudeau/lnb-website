import { defineEventHandler } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamSettingsBody } from '#shared/schemas/team';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const settings = await parseBody(event, teamSettingsBody);
  await teamService.setSettings({ actorId: admin.id, settings });
  return settings;
});
