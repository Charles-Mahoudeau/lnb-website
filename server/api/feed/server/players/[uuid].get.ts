import { defineEventHandler } from 'nuxt/server';

import { feedRightsService } from '~~/server/services/feed/rights';

import { feedPlayerParams } from '#shared/schemas/feed';

// A player's rights, state and unread dots, for any UUID (a guest is `linked: false`).
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  const { uuid } = parseParams(event, feedPlayerParams);
  return feedRightsService.playerState(uuid);
});
