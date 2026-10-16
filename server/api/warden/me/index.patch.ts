import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenPlayerService } from '~~/server/services/warden/players';

import { wardenMePatchBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'warden');
  const { showRealName } = await parseBody(event, wardenMePatchBody);
  await wardenPlayerService.setShowRealName(user, showRealName);
  setResponseStatus(event, 204);
  return null;
});
