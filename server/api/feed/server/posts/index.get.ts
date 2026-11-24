import { defineEventHandler } from 'nuxt/server';

import { feedViewService } from '~~/server/services/feed/views';

import { feedServerPageQuery } from '#shared/schemas/feed';

// A page of a feed for one viewer, with the pinned group on the first page of Announcements.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  const { feed, viewer, limit, before } = parseQuery(event, feedServerPageQuery);
  return feedViewService.page({ who: { player: viewer }, feed, limit, before });
});
