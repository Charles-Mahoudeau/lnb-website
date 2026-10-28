import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { shortLinkService } from '~~/server/services/short-links';

import { shortLinkBody } from '#shared/schemas/short-links';

export default defineEventHandler(async (event) => {
  const actor = await requireAccess(event, {
    permission: 'links:create',
    user: requireEventsManager,
  });
  const body = await parseBody(event, shortLinkBody);
  const created = await shortLinkService.create({
    actorId: actorUserId(actor),
    actorData: actorAuditData(actor),
    body,
  });
  setResponseStatus(event, 201);
  return created;
});
