import { defineEventHandler } from 'nuxt/server';

import { pushSubscriptionService } from '~~/server/services/push/subscriptions';

import { pushPreferencesPatch } from '#shared/schemas/push';

// Switches kinds of notification on or off for the account, on every device.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const patch = await parseBody(event, pushPreferencesPatch);
  return pushSubscriptionService.setPreferences(user.id, patch);
});
