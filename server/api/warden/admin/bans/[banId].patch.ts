import { defineEventHandler } from 'nuxt/server';

import { wardenModerationService } from '~~/server/services/warden/moderation';

import { wardenBanParams, wardenBanUpdateBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { banId } = parseParams(event, wardenBanParams);
  const { expiresAt } = await parseBody(event, wardenBanUpdateBody);
  return wardenModerationService.updateBan({
    banId,
    expiresAt,
    actor: { source: 'web', userId: admin.id },
  });
});
