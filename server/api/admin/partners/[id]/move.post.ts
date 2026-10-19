import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerService } from '~~/server/services/partners';

import { partnerIdParams, partnerMoveBody } from '#shared/schemas/partners';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const { id } = parseParams(event, partnerIdParams);
  const { direction } = await parseBody(event, partnerMoveBody);
  await partnerService.move(id, direction);
  setResponseStatus(event, 204);
  return null;
});
