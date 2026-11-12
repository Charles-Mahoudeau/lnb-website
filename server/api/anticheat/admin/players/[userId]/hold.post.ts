import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatTrustService } from '~~/server/services/anticheat/trust';

import { anticheatHoldBody, anticheatPlayerParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { userId } = parseParams(event, anticheatPlayerParams);
  const { hold, reason } = await parseBody(event, anticheatHoldBody);
  await anticheatTrustService.setHold({
    actor: { source: 'web', userId: admin.id },
    userId,
    hold,
    reason,
  });
  setResponseStatus(event, 204);
  return null;
});
