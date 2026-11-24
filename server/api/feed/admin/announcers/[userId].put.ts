import { defineEventHandler } from 'nuxt/server';

import { feedAnnouncerService } from '~~/server/services/feed/announcers';

import { feedAnnouncerBody, feedAnnouncerParams } from '#shared/schemas/feed';

// Gives or takes the Feed announcer role, from the Person page. Moderators. A real change is
// audited as `minecraft.feed.announcer` and sends a `rights` event.
export default defineEventHandler(async (event) => {
  const user = await requireWardenAdmin(event);
  const { userId } = parseParams(event, feedAnnouncerParams);
  const { announcer } = await parseBody(event, feedAnnouncerBody);
  return feedAnnouncerService.setFromAdmin({ actorId: user.id, userId, announcer });
});
