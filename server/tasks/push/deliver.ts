import { defineTask } from 'nitropack/runtime';

import { flagService } from '~~/server/services/flags';
import { pushDeliverService } from '~~/server/services/push/deliver';
import { pushReminderService } from '~~/server/services/push/reminders';

// Queues the reminders that are due, then sends what is waiting. Idle runs are two indexed
// queries. Scheduled every minute in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'push:deliver',
    description: 'Queue due reminders and send waiting notifications',
  },
  async run() {
    if (
      !(await flagService.isEnabled('jobs.pushDeliver')) ||
      !(await flagService.isEnabled('push'))
    )
      return { result: { skipped: true, queued: 0, sent: 0, dropped: 0, retrying: 0 } };
    const queued = await pushReminderService.queueDue();
    const sent = await pushDeliverService.processDue();
    return {
      result: {
        skipped: false,
        queued,
        sent: sent.sent,
        dropped: sent.skipped,
        retrying: sent.retry,
      },
    };
  },
});
