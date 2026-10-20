import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { shortLinkService } from '~~/server/services/short-links';

import { shortLinkIdParams, shortLinkPatchBody } from '#shared/schemas/short-links';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { id } = parseParams(event, shortLinkIdParams);
  const patch = await parseBody(event, shortLinkPatchBody);
  await shortLinkService.update({ actorId: admin.id, id, patch });
  setResponseStatus(event, 204);
  return null;
});
