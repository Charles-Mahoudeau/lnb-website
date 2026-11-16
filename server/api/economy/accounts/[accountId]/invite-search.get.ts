import { defineEventHandler } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyAccountParams, economyInviteSearchQuery } from '#shared/schemas/economy';

// Finds players an owner can invite: by name, email or Minecraft username, 3 characters at least.
// Shows emails, so owners only, and rate-limited like the tournaments' search.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.sharedAccounts');
  const { accountId } = parseParams(event, economyAccountParams);
  const { q } = parseQuery(event, economyInviteSearchQuery);
  return { items: await economyAccountService.inviteSearch(user.id, accountId, q) };
});
