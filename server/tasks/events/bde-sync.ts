import { defineTask } from 'nitropack/runtime';

import { bdeSyncService } from '~~/server/services/events/bde';
import { flagService } from '~~/server/services/flags';

// Retries the pushes to the BDE website that are due. Idle runs are one indexed query.
// Scheduled every minute in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'events:bde-sync',
    description: 'Retry pending pushes to the BDE website',
  },
  async run() {
    if (!(await flagService.isEnabled('events.bdeSync')))
      return { result: { tried: 0, skipped: true } };
    const tried = await bdeSyncService.processDue();
    return { result: { tried, skipped: false } };
  },
});
