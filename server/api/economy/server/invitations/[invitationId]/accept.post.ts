import { defineEventHandler } from 'nuxt/server';

import { economyServerAccountService } from '~~/server/services/economy/server-accounts';

import { economyInvitationParams, economyServerPlayerBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.sharedAccounts');
  const { invitationId } = parseParams(event, economyInvitationParams);
  const { player } = await parseBody(event, economyServerPlayerBody);
  return economyServerAccountService.accept(invitationId, player);
});
