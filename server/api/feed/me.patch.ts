import { defineEventHandler } from 'nuxt/server';

import { feedRightsService } from '~~/server/services/feed/rights';

import { feedMePatchBody } from '#shared/schemas/feed';

// Picks the posting account, one of the person's linked Minecraft accounts. Answers as GET /me.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  const { postingAccount } = await parseBody(event, feedMePatchBody);
  return feedRightsService.setPostingAccount(user.id, postingAccount);
});
