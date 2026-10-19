import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { pushStatsService } from '~~/server/services/push/stats';

// Removes the notification log after 90 days. Scheduled every night in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'push:prune',
    description: 'Remove push notifications older than 90 days',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.pushPrune')))
      return { result: { removed: 0, skipped: true } };
    return { result: { removed: await pushStatsService.prune(), skipped: false } };
  },
});
