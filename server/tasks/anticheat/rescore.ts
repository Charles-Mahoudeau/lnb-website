import { defineTask } from 'nitropack/runtime';

import { anticheatMaintenanceService } from '~~/server/services/anticheat/maintenance';
import { auditService } from '~~/server/services/audit';
import { flagService } from '~~/server/services/flags';

// Scores again the files whose re-score time has come, for up to 5 minutes. Scheduled every night
// in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'anticheat:rescore',
    description: 'Score anticheat files again when their time has come',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.anticheatRescore')))
      return { result: { skipped: true } };
    const rescored = await anticheatMaintenanceService.rescoreStale();
    await auditService.recordJob('minecraft.anticheat.rescore', {
      files: rescored.files,
      changed: rescored.changed,
    });
    return { result: { skipped: false, ...rescored } };
  },
});
