import { defineEventHandler } from 'nuxt/server';

import { feedServerApiOn } from '~~/server/utils/feed';

// Server-Sent Events for the Feed mod: the `feed` topic (docs/feed-mod.md, section 8), closed
// when `feed` or `feed.serverApi` goes off.
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  return streamMinecraftEvents(event, 'feed', { allowed: feedServerApiOn });
});
