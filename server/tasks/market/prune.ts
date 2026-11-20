import { defineTask } from 'nitropack/runtime';

import { db } from '~~/server/db';
import { auditService } from '~~/server/services/audit';
import { flagService } from '~~/server/services/flags';
import { marketJobs } from '~~/server/services/market/jobs';
import { loadConfig } from '~~/server/services/market/shared';

// Every night: Market history older than the history setting. Scheduled in nuxt.config.ts.
export default defineTask({
  meta: { name: 'market:prune', description: 'Delete old Market history' },
  async run() {
    if (!(await flagService.isEnabled('jobs.marketPrune'))) return { result: { skipped: true } };
    const result = await marketJobs.prune((await loadConfig(db)).historyDays);
    await auditService.recordJob('economy.market.prune', result);
    return { result: { ...result, skipped: false } };
  },
});
