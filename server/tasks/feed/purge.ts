import { defineTask } from 'nitropack/runtime';

import { auditService } from '~~/server/services/audit';
import { feedPurgeService } from '~~/server/services/feed/purge';
import { flagService } from '~~/server/services/flags';

// Every night: Feed posts deleted more than 30 days ago, and notifications nobody took in 30 days.
// Scheduled in nuxt.config.ts.
export default defineTask({
  meta: { name: 'feed:purge', description: 'Erase Feed posts deleted more than 30 days ago' },
  async run() {
    if (!(await flagService.isEnabled('jobs.feedPurge'))) return { result: { skipped: true } };
    const result = await feedPurgeService.purge();
    await auditService.recordJob('minecraft.feed.purge', result);
    return { result: { ...result, skipped: false } };
  },
});
