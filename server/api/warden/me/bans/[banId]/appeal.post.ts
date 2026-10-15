import { defineEventHandler } from 'nuxt/server';

import { wardenModerationService } from '~~/server/services/warden/moderation';

import { wardenAppealBody, wardenBanParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { banId } = parseParams(event, wardenBanParams);
  const { body } = await parseBody(event, wardenAppealBody);
  return wardenModerationService.appeal({ actorId: user.id, banId, body });
});
