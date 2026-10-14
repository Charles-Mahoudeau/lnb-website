import { createError, defineEventHandler, readBody } from 'nuxt/server';

import { linkService } from '~~/server/services/links';

import { linkApproveBody } from '#shared/schemas/link';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  // Not readValidatedBody: in Nuxt 4.6 it pulls the app's error module, and with it
  // app.config.ts, into the server bundle, which then fails on every request.
  const body = linkApproveBody.safeParse(await readBody(event));
  if (!body.success) throw createError({ status: 400, statusText: 'Bad Request' });
  return linkService.approve({ actor: user, body: body.data });
});
