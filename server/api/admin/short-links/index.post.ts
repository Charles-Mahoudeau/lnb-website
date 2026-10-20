import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { shortLinkService } from '~~/server/services/short-links';

import { shortLinkBody } from '#shared/schemas/short-links';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await parseBody(event, shortLinkBody);
  const created = await shortLinkService.create({ actorId: admin.id, body });
  setResponseStatus(event, 201);
  return created;
});
