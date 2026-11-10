import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { economyAdminService } from '~~/server/services/economy/admin';

import { economyResetBody } from '#shared/schemas/economy';

// Site admins only: deletes every account and the whole ledger.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { confirm } = await parseBody(event, economyResetBody);
  await economyAdminService.reset(admin.id, confirm);
  setResponseStatus(event, 204);
  return null;
});
