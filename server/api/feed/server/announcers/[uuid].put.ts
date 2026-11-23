import { defineEventHandler } from 'nuxt/server';

import { feedAnnouncerService } from '~~/server/services/feed/announcers';

import { feedPlayerParams, feedServerAnnouncerBody } from '#shared/schemas/feed';

// `/feed announcer add|remove`: gives or takes the announcer role, checked against the issuer.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  const { uuid } = parseParams(event, feedPlayerParams);
  const body = await parseBody(event, feedServerAnnouncerBody);
  return feedAnnouncerService.setFromServer({ uuid, ...body });
});
