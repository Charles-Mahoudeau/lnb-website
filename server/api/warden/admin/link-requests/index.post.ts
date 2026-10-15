import { defineEventHandler } from 'nuxt/server';

import { wardenManualLinkService } from '~~/server/services/warden/manual-links';

import { wardenManualLinkBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const body = await parseBody(event, wardenManualLinkBody);
  return wardenManualLinkService.create({ body, actorId: admin.id });
});
