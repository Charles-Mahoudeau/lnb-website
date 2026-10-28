import { defineTask } from 'nitropack/runtime';

import { apiKeyService } from '~~/server/services/api-keys';
import { flagService } from '~~/server/services/flags';

// Deletes API keys that stopped working long ago, and old call counts. Scheduled in
// nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'api-keys:prune',
    description: 'Remove API keys that stopped working long ago, and old call counts',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.pruneApiKeys')))
      return { result: { keys: 0, usage: 0, skipped: true } };
    return { result: { ...(await apiKeyService.prune()), skipped: false } };
  },
});
