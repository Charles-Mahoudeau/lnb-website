import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { gamesplanetService } from '~~/server/services/gamesplanet';

// Reads Gamesplanet's whole catalog (about 12 MB), so prices and links can be looked up for any
// game. Scheduled every night in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'gamesplanet:sync-catalog',
    description: 'Read the Gamesplanet catalog',
  },
  async run() {
    if (
      !(await flagService.isEnabled('gamesplanet')) ||
      !(await flagService.isEnabled('jobs.gamesplanetCatalog'))
    )
      return { result: { skipped: true } };
    return { result: { skipped: false, ...(await gamesplanetService.syncCatalog()) } };
  },
});
