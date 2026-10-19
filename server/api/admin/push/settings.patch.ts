import { defineEventHandler } from 'nuxt/server';

import { pushSettingsService } from '~~/server/services/push/settings';

import { pushSettings } from '#shared/schemas/push';

// The weekly limit that triggers warnings, and how long the prompt stays quiet after "Not now".
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const settings = await parseBody(event, pushSettings);
  await pushSettingsService.set({ actorId: admin.id, settings });
  return pushSettingsService.get();
});
