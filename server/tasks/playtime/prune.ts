import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { playtimePruneService } from '~~/server/services/playtime/prune';

// Deletes old playtime ledger rows and spent warnings. Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'playtime:prune',
    description:
      'Delete playtime ledger rows older than 26 weeks and the warnings of ended sessions',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.playtimePrune')))
      return { result: { ledger: 0, notices: 0, skipped: true } };
    return { result: { ...(await playtimePruneService.prune()), skipped: false } };
  },
});
