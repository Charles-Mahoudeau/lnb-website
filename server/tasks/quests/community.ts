import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { communityService } from '~~/server/services/quests/community';

// Every 5 minutes: pays community quests that ended, starts the next scheduled one, and draws one
// from the templates when the rotation is on (docs/quests.md). Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'quests:community',
    description: 'Start, end and pay community quests',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.questsCommunity')))
      return { result: { skipped: true } };
    await communityService.tick();
    return { result: { skipped: false } };
  },
});
