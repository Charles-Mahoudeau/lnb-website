import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerService } from '~~/server/services/partners';

import { partnerBody } from '#shared/schemas/partners';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await parseBody(event, partnerBody);
  const created = await partnerService.create({ actorId: admin.id, body });
  setResponseStatus(event, 201);
  return created;
});
