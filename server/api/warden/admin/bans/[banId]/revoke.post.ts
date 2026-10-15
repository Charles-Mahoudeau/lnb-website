import { defineEventHandler } from 'nuxt/server';

import { wardenModerationService } from '~~/server/services/warden/moderation';

import { wardenBanParams, wardenRevokeBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { banId } = parseParams(event, wardenBanParams);
  const { reason } = await parseBody(event, wardenRevokeBody);
  return wardenModerationService.revokeById({
    banId,
    reason,
    actor: { source: 'web', userId: admin.id },
  });
});
