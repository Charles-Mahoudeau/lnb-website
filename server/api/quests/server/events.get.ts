import { defineEventHandler } from 'nuxt/server';

// Server-Sent Events for lnb-quests: quests and settings edited on the site, and rewards claimed
// there. See docs/quests.md.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.quests');
  return streamMinecraftEvents(event, 'quests');
});
