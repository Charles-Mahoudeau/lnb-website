import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenAdminService } from '~~/server/services/warden/admin';

import { wardenTransferParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { transferId } = parseParams(event, wardenTransferParams);
  await wardenAdminService.dismissTransfer({
    transferId,
    actor: { source: 'web', userId: admin.id },
  });
  setResponseStatus(event, 204);
  return null;
});
