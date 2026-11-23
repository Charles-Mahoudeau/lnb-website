import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedPostService } from '~~/server/services/feed/posts';

import { feedIdParams, feedPlayerQuery } from '#shared/schemas/feed';

// Deletes a post (with its thread) or a reply: its author, or a moderator. Not behind writing.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  const { id } = parseParams(event, feedIdParams);
  const { player } = parseQuery(event, feedPlayerQuery);
  await feedPostService.remove({ actor: { source: 'server', player }, postId: id });
  setResponseStatus(event, 204);
  return null;
});
