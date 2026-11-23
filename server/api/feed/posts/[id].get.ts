import { defineEventHandler } from 'nuxt/server';

import { feedViewService } from '~~/server/services/feed/views';

import { feedIdParams, feedThreadQuery } from '#shared/schemas/feed';

// A thread for the signed-in person: the main post and a page of its replies, oldest first.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  const { id } = parseParams(event, feedIdParams);
  const { limit, after } = parseQuery(event, feedThreadQuery);
  return feedViewService.thread({ who: { userId: user.id }, id, limit, after });
});
