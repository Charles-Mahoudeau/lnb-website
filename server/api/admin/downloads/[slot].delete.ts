import { defineEventHandler } from 'nuxt/server';

import { downloadService } from '~~/server/services/downloads';

import { downloadSlotParams } from '#shared/schemas/downloads';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { slot } = parseParams(event, downloadSlotParams);
  return downloadService.clear({ slot, actorId: admin.id });
});
