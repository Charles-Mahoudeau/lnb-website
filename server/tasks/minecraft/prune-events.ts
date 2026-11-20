import { defineTask } from 'nitropack/runtime';

import { auditService } from '~~/server/services/audit';
import { flagService } from '~~/server/services/flags';
import { minecraftEventService } from '~~/server/services/minecraft-events';

// Deletes the Minecraft server events older than a day. Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'minecraft:prune-events',
    description: 'Delete Minecraft server events older than a day',
  },
  async run() {
    if (!(await flagService.isEnabled('jobs.pruneServerEvents')))
      return { result: { deleted: 0, skipped: true } };
    const deleted = await minecraftEventService.prune();
    await auditService.recordJob('minecraft.events.prune', { deleted });
    return { result: { deleted, skipped: false } };
  },
});
