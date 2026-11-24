import { defineEventHandler } from 'nuxt/server';

import { feedViewService } from '~~/server/services/feed/views';

import { feedViewsQuery } from '#shared/schemas/feed';

// The signed-in person's own views of a few posts or replies, for what the live stream announced.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  const { ids } = parseQuery(event, feedViewsQuery);
  return feedViewService.viewsOf({ userId: user.id }, ids);
});
