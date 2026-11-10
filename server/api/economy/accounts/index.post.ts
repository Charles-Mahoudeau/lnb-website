import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyCreateBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.sharedAccounts');
  const account = await economyAccountService.create(
    user.id,
    await parseBody(event, economyCreateBody),
  );
  setResponseStatus(event, 201);
  return account;
});
