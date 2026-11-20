import { defineTask } from 'nitropack/runtime';

import { anticheatMaintenanceService } from '~~/server/services/anticheat/maintenance';
import { auditService } from '~~/server/services/audit';
import { flagService } from '~~/server/services/flags';

// Deletes old anticheat reports, usage, dismissed alerts and files nobody uses. Scheduled every
// night in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'anticheat:prune',
    description: 'Remove old anticheat reports, usage, alerts and unused files',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.anticheatPrune'))) return { result: { skipped: true } };
    const pruned = await anticheatMaintenanceService.prune();
    await auditService.recordJob('minecraft.anticheat.prune', { ...pruned });
    return { result: { skipped: false, ...pruned } };
  },
});
