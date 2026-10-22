import { defineEventHandler } from 'nuxt/server';

import { db } from '~~/server/db';
import { wardenDeviceService } from '~~/server/services/warden/devices';
import { requireWardenSchool } from '~~/server/services/warden/players';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'warden.linking');
  requireWardenSchool(user.tenantId);
  return wardenDeviceService.list(db, user.id);
});
