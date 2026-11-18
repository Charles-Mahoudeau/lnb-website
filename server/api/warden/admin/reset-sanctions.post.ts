import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenResetService } from '~~/server/services/warden/reset';

import { wardenResetSanctionsBody } from '#shared/schemas/warden';

// Site admins only: every ban, appeal and note, and the anticheat's sanctions.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { confirm } = await parseBody(event, wardenResetSanctionsBody);
  await wardenResetService.resetSanctions({ source: 'web', userId: admin.id }, confirm);
  setResponseStatus(event, 204);
  return null;
});
