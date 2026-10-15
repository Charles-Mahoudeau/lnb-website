import { defineEventHandler } from 'nuxt/server';

import { wardenLinkService } from '~~/server/services/warden/links';

import { wardenUserCodeParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { userCode } = parseParams(event, wardenUserCodeParams);
  return wardenLinkService.preview({ actorId: user.id, userCode });
});
