import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerService } from '~~/server/services/partners';

import { partnerIdParams, partnerPatchBody } from '#shared/schemas/partners';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { id } = parseParams(event, partnerIdParams);
  const patch = await parseBody(event, partnerPatchBody);
  await partnerService.update({ actorId: admin.id, id, patch });
  setResponseStatus(event, 204);
  return null;
});
