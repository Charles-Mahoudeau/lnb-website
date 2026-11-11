import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { partnerEventAdminService } from '~~/server/services/partner-events-admin';

// Deletes the interest, teams and dates of birth of partner events closed for 60 days. Scheduled
// in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'partner-events:purge',
    description: 'Delete the data of partner events closed for 60 days',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.purgePartnerEvents')))
      return { result: { purged: 0, skipped: true } };
    const purged = await partnerEventAdminService.purgeClosed();
    return { result: { purged, skipped: false } };
  },
});
