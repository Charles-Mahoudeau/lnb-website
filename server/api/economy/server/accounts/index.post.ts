import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { economyServerAccountService } from '~~/server/services/economy/server-accounts';

import { economyServerCreateBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.sharedAccounts');
  const account = await economyServerAccountService.create(
    await parseBody(event, economyServerCreateBody),
  );
  setResponseStatus(event, 201);
  return account;
});
