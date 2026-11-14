import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { gamesplanetService } from '~~/server/services/gamesplanet';
import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

// Removes the covers of games the site no longer shows, and click counts over a year old. Scheduled every night in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'gamesplanet:prune-covers',
    description: 'Remove Gamesplanet covers nothing uses',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.pruneGamesplanetCovers')))
      return { result: { removed: 0, clicks: 0, skipped: true } };
    const removed = await gamesplanetService.pruneCovers();
    const clicks = await gamesplanetDealsService.pruneClicks();
    return { result: { removed, clicks, skipped: false } };
  },
});
