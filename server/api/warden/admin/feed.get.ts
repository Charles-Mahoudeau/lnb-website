import { defineEventHandler } from 'nuxt/server';

import { wardenFeedService } from '~~/server/services/warden/feed';

import { wardenFeedQuery } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return wardenFeedService.feed(parseQuery(event, wardenFeedQuery));
});
