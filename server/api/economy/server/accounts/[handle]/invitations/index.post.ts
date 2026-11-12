import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { economyServerAccountService } from '~~/server/services/economy/server-accounts';

import { economyHandleParams, economyServerInviteBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.sharedAccounts');
  const { handle } = parseParams(event, economyHandleParams);
  const invitation = await economyServerAccountService.invite(
    handle,
    await parseBody(event, economyServerInviteBody),
  );
  setResponseStatus(event, 201);
  return invitation;
});
