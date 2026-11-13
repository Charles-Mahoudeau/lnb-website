import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { questAdminService } from '~~/server/services/quests/admin';

// Every night at 04:00 Paris: the day's quest reward index, from the active players' personal
// balances (docs/quests.md). Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'quests:index',
    description: 'Compute the daily quest reward index',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.questsIndex'))) return { result: { skipped: true } };
    const result = await questAdminService.runIndex();
    return { result: { ...result, skipped: false } };
  },
});
