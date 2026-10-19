import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { pushSubscriptionService } from '~~/server/services/push/subscriptions';

import { pushUnsubscribeBody } from '#shared/schemas/push';

// Turns notifications off on the calling browser. Not behind the flag: leaving always works.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { endpoint } = await parseBody(event, pushUnsubscribeBody);
  await pushSubscriptionService.unsubscribe(user.id, endpoint);
  setResponseStatus(event, 204);
  return null;
});
