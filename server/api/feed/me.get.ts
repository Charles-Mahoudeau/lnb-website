import { defineEventHandler } from 'nuxt/server';

import { feedRightsService } from '~~/server/services/feed/rights';

// The signed-in person's Feed state: rights, ban, unread dots and the posting account.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  return feedRightsService.me(user.id);
});
