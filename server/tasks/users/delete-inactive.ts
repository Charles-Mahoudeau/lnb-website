import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { usersService } from '~~/server/services/users';

// Deletes accounts with no sign-in for 24 months. Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'users:delete-inactive',
    description: 'Delete accounts with no sign-in for 24 months',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.deleteInactive')))
      return { result: { deleted: 0, skipped: true } };
    const deleted = await usersService.deleteInactive();
    return { result: { deleted, skipped: false } };
  },
});
