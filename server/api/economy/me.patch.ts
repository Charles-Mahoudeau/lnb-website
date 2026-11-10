import { defineEventHandler } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyMePatchBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy');
  await economyAccountService.updateMe(user.id, await parseBody(event, economyMePatchBody));
  return economyAccountService.me(user.id);
});
