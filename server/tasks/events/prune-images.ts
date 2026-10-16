import { defineTask } from 'nitropack/runtime';

import { eventImageService } from '~~/server/services/events/images';
import { flagService } from '~~/server/services/flags';

// Removes event images no event uses any more: replaced, from deleted events, or picked in a
// form never saved. Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'events:prune-images',
    description: 'Remove event images no event uses',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.pruneEventImages')))
      return { result: { removed: 0, skipped: true } };
    const removed = await eventImageService.prune();
    return { result: { removed, skipped: false } };
  },
});
