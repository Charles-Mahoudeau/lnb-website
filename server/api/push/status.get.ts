import { defineEventHandler } from 'nuxt/server';

import { flagService } from '~~/server/services/flags';
import { pushSubscriptionService } from '~~/server/services/push/subscriptions';

// What /account needs to show the notification settings: the switches, the devices, the counts.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return pushSubscriptionService.status(user.id, await flagService.isEnabled('push'));
});
