import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { modpackCheckService } from '~~/server/services/modpack/check';

// Looks for newer files of the Modlist's mods and notes them for the update badge. It never changes
// what the manifest lists: an admin adopts. Scheduled every night in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'modpack:check-latest',
    description: "Look for newer files of the Modlist's mods",
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.modpackLatest'))) return { result: { skipped: true } };
    return { result: { skipped: false, ...(await modpackCheckService.check()) } };
  },
});
