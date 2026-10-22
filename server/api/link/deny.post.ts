import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { linkService } from '~~/server/services/links';

import { linkDenyBody } from '#shared/schemas/link';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'appLinking');
  await linkService.deny({
    actor: user,
    userCode: (await parseBody(event, linkDenyBody)).userCode,
  });
  setResponseStatus(event, 204);
  return null;
});
