import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { economyServerAccountService } from '~~/server/services/economy/server-accounts';

import { economyServerInvitationParams, economyServerPlayerQuery } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.sharedAccounts');
  const { handle, invitationId } = parseParams(event, economyServerInvitationParams);
  const { player } = parseQuery(event, economyServerPlayerQuery);
  await economyServerAccountService.cancelInvitation(handle, invitationId, player);
  setResponseStatus(event, 204);
  return null;
});
