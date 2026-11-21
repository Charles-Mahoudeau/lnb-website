import { defineTask } from 'nitropack/runtime';

import { changelogService } from '~~/server/services/changelog';
import { flagService } from '~~/server/services/flags';

// Publishes the changelog posts whose date has passed. Scheduled every minute in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'changelog:publish-scheduled',
    description: 'Publish the scheduled changelog posts that are due',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.changelogPublish')))
      return { result: { published: 0, skipped: true } };
    const published = await changelogService.publishDue();
    return { result: { published, skipped: false } };
  },
});
