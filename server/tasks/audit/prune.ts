import { defineTask } from 'nitropack/runtime';

import { auditService } from '~~/server/services/audit';
import { flagService } from '~~/server/services/flags';

// Deletes activity log entries older than 24 months. Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'audit:prune',
    description: 'Delete activity log entries older than 24 months',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.pruneAudit')))
      return { result: { removed: 0, skipped: true } };
    return { result: { removed: await auditService.prune(), skipped: false } };
  },
});
