import { defineTask } from 'nitropack/runtime';

import { avatarService } from '~~/server/services/avatars';

// Removes profile photos no account uses any more: replaced at sign-in, or of deleted
// accounts. Scheduled in nuxt.config.ts.
export default defineTask({
  meta: {
    name: 'users:prune-avatars',
    description: 'Remove profile photos no account uses',
  },
  async run() {
    const removed = await avatarService.prune();
    return { result: { removed } };
  },
});
