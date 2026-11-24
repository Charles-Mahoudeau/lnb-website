import { defineEventHandler } from 'nuxt/server';

// The browser's live stream: the public events of the `feed` topic, as Server-Sent Events, through
// the hub every tab shares (docs/feed.md, "Live updates in the browser").
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'feed');
  await requireFlag(event, 'feed.live');
  return streamFeedLive(event, user.id);
});
