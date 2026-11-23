import { defineEventHandler } from 'nuxt/server';

import { feedViewService } from '~~/server/services/feed/views';

import { feedViewsBody } from '#shared/schemas/feed';

// Many viewers' views of a few posts, for relaying what the stream announces.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  return feedViewService.views(await parseBody(event, feedViewsBody));
});
