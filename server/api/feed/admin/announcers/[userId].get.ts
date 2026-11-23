import { defineEventHandler } from 'nuxt/server';

import { feedAnnouncerService } from '~~/server/services/feed/announcers';

import { feedAnnouncerParams } from '#shared/schemas/feed';

// Whether a person is a Feed announcer, for the Person page's switch and header pill. Moderators.
export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { userId } = parseParams(event, feedAnnouncerParams);
  return feedAnnouncerService.get(userId);
});
