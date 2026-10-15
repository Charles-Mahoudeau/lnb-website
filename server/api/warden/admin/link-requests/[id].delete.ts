import { defineEventHandler } from 'nuxt/server';

import { wardenManualLinkService } from '~~/server/services/warden/manual-links';

import { wardenIdParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, wardenIdParams);
  return wardenManualLinkService.cancel({ id, actorId: admin.id });
});
