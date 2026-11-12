import { defineTask } from 'nitropack/runtime';

import { anticheatLookupService } from '~~/server/services/anticheat/lookup';
import { flagService } from '~~/server/services/flags';

// Looks up the files waiting for Modrinth and CurseForge, retries the ones not found, and times
// out the ones that waited too long. Scheduled every minute in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'anticheat:lookups',
    description: 'Look up anticheat files on Modrinth and CurseForge',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.anticheatLookups')))
      return { result: { skipped: true } };
    return { result: { skipped: false, ...(await anticheatLookupService.run()) } };
  },
});
