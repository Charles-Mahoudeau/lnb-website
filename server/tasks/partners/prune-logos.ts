import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { partnerService } from '~~/server/services/partners';

// Removes logos no partner uses any more: replaced, from deleted partners, or uploaded in a form
// never saved. Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'partners:prune-logos',
    description: 'Remove partner logos no partner uses',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.prunePartnerLogos')))
      return { result: { removed: 0, skipped: true } };
    const removed = await partnerService.pruneLogos();
    return { result: { removed, skipped: false } };
  },
});
