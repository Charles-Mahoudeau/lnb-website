import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedPostService } from '~~/server/services/feed/posts';

import { feedIdParams, feedServerReplyBody } from '#shared/schemas/feed';

// Creates a reply in the thread of main post `id`. Idempotent by key.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  await requireFlag(event, 'feed.writing');
  const { id } = parseParams(event, feedIdParams);
  const { player, ...body } = await parseBody(event, feedServerReplyBody);
  const created = await withRetryAfter(
    event,
    feedPostService.reply({ actor: { source: 'server', player }, threadId: id, ...body }),
  );
  setResponseStatus(event, 201);
  return created;
});
