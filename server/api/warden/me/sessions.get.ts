import { defineEventHandler } from 'nuxt/server';

import { wardenPlayerService } from '~~/server/services/warden/players';

import { wardenCursorQuery } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'warden');
  const { cursor } = parseQuery(event, wardenCursorQuery);
  return wardenPlayerService.sessions(user.id, cursor);
});
