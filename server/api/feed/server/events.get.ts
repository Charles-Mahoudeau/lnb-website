import { defineEventHandler } from 'nuxt/server';

// Server-Sent Events for the Feed mod: the `feed` topic (docs/feed-mod.md, section 8).
export default defineEventHandler(async (event) => {
  await requireFeedServer(event);
  return streamMinecraftEvents(event, 'feed');
});
