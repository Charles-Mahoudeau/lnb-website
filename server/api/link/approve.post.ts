import { defineEventHandler } from 'nuxt/server';

import { linkService } from '~~/server/services/links';

import { linkApproveBody } from '#shared/schemas/link';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return linkService.approve({ actor: user, body: await parseBody(event, linkApproveBody) });
});
