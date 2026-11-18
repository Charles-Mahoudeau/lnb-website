import { defineEventHandler } from 'nuxt/server';

import { downloadService } from '~~/server/services/downloads';

import { downloadSlotBody, downloadSlotParams } from '#shared/schemas/downloads';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { slot } = parseParams(event, downloadSlotParams);
  const body = await parseBody(event, downloadSlotBody);
  return downloadService.set({ slot, body, actorId: admin.id });
});
