import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { marketJobs } from '~~/server/services/market/jobs';

// Every hour: the price and stock of each item, for the charts (docs/market.md). Scheduled in
// nuxt.config.ts.
export default defineTask({
  meta: { name: 'market:snapshot', description: 'Record the Market prices for the charts' },
  async run() {
    if (!(await flagService.isEnabled('jobs.marketSnapshot'))) return { result: { skipped: true } };
    return { result: { ...(await marketJobs.snapshot()), skipped: false } };
  },
});
