import { defineEventHandler } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyMemberParams, economyMemberRoleBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.sharedAccounts');
  const { accountId, userId } = parseParams(event, economyMemberParams);
  const { role } = await parseBody(event, economyMemberRoleBody);
  await economyAccountService.setMemberRole(user.id, accountId, userId, role);
  return economyAccountService.detail(user.id, accountId);
});
