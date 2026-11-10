import { defineEventHandler } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyAccountInvitationParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.sharedAccounts');
  const { accountId, invitationId } = parseParams(event, economyAccountInvitationParams);
  await economyAccountService.cancelInvitation(user.id, accountId, invitationId);
  return economyAccountService.detail(user.id, accountId);
});
