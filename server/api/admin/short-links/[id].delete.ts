import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { shortLinkService } from '~~/server/services/short-links';

import { shortLinkIdParams } from '#shared/schemas/short-links';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, shortLinkIdParams);
  await shortLinkService.remove({ actorId: manager.id, id });
  setResponseStatus(event, 204);
  return null;
});
