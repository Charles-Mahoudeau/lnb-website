import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedPostService } from '~~/server/services/feed/posts';

import { feedPostBody } from '#shared/schemas/feed';

// Creates a main post from the person's posting account. Idempotent by key.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  await requireFlag(event, 'feed.writing');
  const body = await parseBody(event, feedPostBody);
  const created = await withRetryAfter(
    event,
    feedPostService.create({ actor: { source: 'site', userId: user.id }, ...body }),
  );
  setResponseStatus(event, 201);
  return created;
});
