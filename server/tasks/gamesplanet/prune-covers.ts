import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { gamesplanetService } from '~~/server/services/gamesplanet';

// Removes the covers of games the site no longer shows. Scheduled every night in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'gamesplanet:prune-covers',
    description: 'Remove Gamesplanet covers nothing uses',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.pruneGamesplanetCovers')))
      return { result: { removed: 0, skipped: true } };
    const removed = await gamesplanetService.pruneCovers();
    return { result: { removed, skipped: false } };
  },
});
