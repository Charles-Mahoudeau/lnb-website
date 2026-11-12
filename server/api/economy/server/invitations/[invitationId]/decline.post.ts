import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { economyServerAccountService } from '~~/server/services/economy/server-accounts';

import { economyInvitationParams, economyServerPlayerBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.sharedAccounts');
  const { invitationId } = parseParams(event, economyInvitationParams);
  const { player } = await parseBody(event, economyServerPlayerBody);
  await economyServerAccountService.decline(invitationId, player);
  setResponseStatus(event, 204);
  return null;
});
