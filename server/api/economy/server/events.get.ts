import { defineEventHandler } from 'nuxt/server';

// Server-Sent Events for lnb-economy: changes made on the site to accounts the server keeps a
// copy of. See docs/economy.md.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  return streamMinecraftEvents(event, 'economy');
});
