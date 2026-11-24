import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedPostService } from '~~/server/services/feed/posts';

import { feedIdParams, feedReplyBody } from '#shared/schemas/feed';

// Creates a reply in the thread of main post `id`, from the person's posting account.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  await requireFlag(event, 'feed.writing');
  const { id } = parseParams(event, feedIdParams);
  const body = await parseBody(event, feedReplyBody);
  const created = await withRetryAfter(
    event,
    feedPostService.reply({ actor: { source: 'site', userId: user.id }, threadId: id, ...body }),
  );
  setResponseStatus(event, 201);
  return created;
});
