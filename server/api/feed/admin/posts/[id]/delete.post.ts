import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedPostService } from '~~/server/services/feed/posts';

import { feedAdminDeleteBodyOrNone, feedIdParams } from '#shared/schemas/feed';

// Deletes a post (with its thread) or a reply as a moderator, with an optional reason. Audited as
// `minecraft.feed.delete` when it is someone else's. Never behind a flag.
export default defineEventHandler(async (event) => {
  const user = await requireWardenAdmin(event);
  const { id } = parseParams(event, feedIdParams);
  const body = await parseBody(event, feedAdminDeleteBodyOrNone);
  await feedPostService.remove({
    actor: { source: 'site', userId: user.id },
    postId: id,
    reason: body?.reason || null,
  });
  setResponseStatus(event, 204);
  return null;
});
