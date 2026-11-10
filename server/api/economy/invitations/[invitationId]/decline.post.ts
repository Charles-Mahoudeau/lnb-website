import { defineEventHandler } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyInvitationParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.sharedAccounts');
  const { invitationId } = parseParams(event, economyInvitationParams);
  await economyAccountService.declineInvitation(user.id, invitationId);
  return economyAccountService.me(user.id);
});
