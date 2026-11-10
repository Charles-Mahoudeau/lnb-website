import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyMemberParams } from '#shared/schemas/economy';

// An owner removing a member, or a member leaving (their own user ID).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.sharedAccounts');
  const { accountId, userId } = parseParams(event, economyMemberParams);
  await economyAccountService.removeMember(user.id, accountId, userId);
  setResponseStatus(event, 204);
  return null;
});
