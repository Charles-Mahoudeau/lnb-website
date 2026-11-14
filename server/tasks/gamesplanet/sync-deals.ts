import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { gamesplanetService } from '~~/server/services/gamesplanet';

// Reads Gamesplanet's best sellers and flash sales, and downloads the covers of the games the
// site shows. Scheduled every 6 hours in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'gamesplanet:sync-deals',
    description: 'Read the Gamesplanet best sellers and flash sales',
  },
  async run() {
    if (
      !(await flagService.isEnabled('gamesplanet')) ||
      !(await flagService.isEnabled('jobs.gamesplanetDeals'))
    )
      return { result: { skipped: true } };
    return { result: { skipped: false, ...(await gamesplanetService.syncDeals()) } };
  },
});
