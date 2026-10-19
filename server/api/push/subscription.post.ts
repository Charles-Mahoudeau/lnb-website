import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { pushSubscriptionService } from '~~/server/services/push/subscriptions';

import { pushSubscribeBody } from '#shared/schemas/push';

// Saves the browser's push subscription for the account. Again from the same browser: updates it.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'push.subscribe');
  const body = await parseBody(event, pushSubscribeBody);
  await pushSubscriptionService.subscribe({
    userId: user.id,
    body,
    userAgent: event.req.headers.get('user-agent') ?? undefined,
  });
  setResponseStatus(event, 204);
  return null;
});
