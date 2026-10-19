import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerService } from '~~/server/services/partners';

import { partnerIdParams } from '#shared/schemas/partners';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { id } = parseParams(event, partnerIdParams);
  await partnerService.remove({ actorId: admin.id, id });
  setResponseStatus(event, 204);
  return null;
});
