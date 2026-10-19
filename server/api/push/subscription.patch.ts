import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { pushSubscriptionService } from '~~/server/services/push/subscriptions';

import { pushLocaleBody } from '#shared/schemas/push';

// Keeps the language of a device's notifications in step with the account page.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { endpoint, locale } = await parseBody(event, pushLocaleBody);
  await pushSubscriptionService.setLocale(user.id, endpoint, locale);
  setResponseStatus(event, 204);
  return null;
});
