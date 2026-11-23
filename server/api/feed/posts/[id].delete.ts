import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { feedPostService } from '~~/server/services/feed/posts';

import { feedIdParams } from '#shared/schemas/feed';

// Deletes the person's own post (with its thread) or reply. Moderators delete others' in the
// admin. Not behind writing.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  const { id } = parseParams(event, feedIdParams);
  await feedPostService.remove({
    actor: { source: 'site', userId: user.id },
    postId: id,
    ownOnly: true,
  });
  setResponseStatus(event, 204);
  return null;
});
