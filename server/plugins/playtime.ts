import { defineNitroPlugin } from 'nitropack/runtime';

import { playtimeService } from '~~/server/services/playtime/service';

// Counts the time of the players who are online, every 5 seconds (docs/playtime.md). Only one
// instance of the site runs, so there is no lock. The tick rebuilds everything from the database,
// so a restart loses at most 5 seconds. The timer doesn't keep the process alive.
const TICK_MS = 5000;

export default defineNitroPlugin(() => {
  if (import.meta.prerender) return;
  setInterval(() => {
    playtimeService.tick().catch((error: unknown) => {
      console.error('[playtime] tick failed:', error);
    });
  }, TICK_MS).unref();
});
