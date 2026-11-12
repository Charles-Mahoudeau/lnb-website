import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatTrustService } from '~~/server/services/anticheat/trust';

import { anticheatPlayerParams, anticheatScoreBody } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { userId } = parseParams(event, anticheatPlayerParams);
  const { score, reason } = await parseBody(event, anticheatScoreBody);
  await anticheatTrustService.adjust({
    actor: { source: 'web', userId: admin.id },
    userId,
    score,
    reason,
  });
  setResponseStatus(event, 204);
  return null;
});
