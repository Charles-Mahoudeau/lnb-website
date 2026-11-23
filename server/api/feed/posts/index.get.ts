import { defineEventHandler } from 'nuxt/server';

import { feedViewService } from '~~/server/services/feed/views';

import { feedPageQuery } from '#shared/schemas/feed';

// A page of a feed for the signed-in person, with the pinned group on the first page of
// Announcements.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  const { feed, limit, before } = parseQuery(event, feedPageQuery);
  return feedViewService.page({ who: { userId: user.id }, feed, limit, before });
});
