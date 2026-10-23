import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { shortLinkService } from '~~/server/services/short-links';

import { shortLinkBody } from '#shared/schemas/short-links';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const body = await parseBody(event, shortLinkBody);
  const created = await shortLinkService.create({ actorId: manager.id, body });
  setResponseStatus(event, 201);
  return created;
});
