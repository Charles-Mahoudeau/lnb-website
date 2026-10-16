import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { wardenSessionService } from '~~/server/services/warden/sessions';

// Closes Warden sessions with no heartbeat for 3 minutes, such as after a Minecraft server crash.
// Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'warden:close-stale-sessions',
    description: 'Close Warden sessions with no heartbeat',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.closeStaleSessions')))
      return { result: { closed: 0, skipped: true } };
    const closed = await wardenSessionService.closeStale();
    return { result: { closed, skipped: false } };
  },
});
