import { defineEventHandler, setResponseStatus } from 'nuxt/server';
import { z } from 'zod';

import { pushSubscriptionService } from '~~/server/services/push/subscriptions';

const params = z.object({ id: z.coerce.number().int().positive() });

// Removes one of the account's devices, such as a phone it no longer has.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { id } = parseParams(event, params);
  await pushSubscriptionService.removeDevice(user.id, id);
  setResponseStatus(event, 204);
  return null;
});
