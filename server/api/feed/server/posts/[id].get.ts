import { defineEventHandler } from 'nuxt/server';

import { feedViewService } from '~~/server/services/feed/views';

import { feedIdParams, feedServerThreadQuery } from '#shared/schemas/feed';

// A thread for one viewer: the main post and a page of its replies, oldest first.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  const { id } = parseParams(event, feedIdParams);
  const { viewer, limit, after } = parseQuery(event, feedServerThreadQuery);
  return feedViewService.thread({ who: { player: viewer }, id, limit, after });
});
