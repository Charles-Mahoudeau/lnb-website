import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedPostService } from '~~/server/services/feed/posts';

import { feedServerPostBody } from '#shared/schemas/feed';

// Creates a main post for a player. Idempotent by key.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  await requireFlag(event, 'feed.writing');
  const { player, ...body } = await parseBody(event, feedServerPostBody);
  const created = await withRetryAfter(
    event,
    feedPostService.create({ actor: { source: 'server', player }, ...body }),
  );
  setResponseStatus(event, 201);
  return created;
});
