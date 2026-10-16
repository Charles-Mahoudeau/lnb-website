import { defineEventHandler } from 'nuxt/server';

import { flagService } from '~~/server/services/flags';

import { flagParams, flagPatchBody } from '#shared/schemas/flags';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { key } = parseParams(event, flagParams);
  const { enabled } = await parseBody(event, flagPatchBody);
  await flagService.set({ key, enabled, actorId: admin.id });
  return { items: await flagService.list() };
});
