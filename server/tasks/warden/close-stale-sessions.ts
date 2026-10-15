import { defineTask } from 'nitropack/runtime';

import { wardenSessionService } from '~~/server/services/warden/sessions';

// Closes Warden sessions with no heartbeat for 3 minutes, such as after a Minecraft server crash.
// Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'warden:close-stale-sessions',
    description: 'Close Warden sessions with no heartbeat',
  },
  async run() {
    const closed = await wardenSessionService.closeStale();
    return { result: { closed } };
  },
});
