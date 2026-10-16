import { defineEventHandler } from 'nuxt/server';

import { eventPublicService } from '~~/server/services/events/public';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events');
  return eventPublicService.mine(user.id);
});
