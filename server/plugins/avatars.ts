import { defineNitroPlugin } from 'nitropack/runtime';

import { setAvatarStore } from '~~/server/lib/avatars';
import { avatarService } from '~~/server/services/avatars';

// Lets Better Auth (server/lib/auth.ts) store profile photos without importing Nitro.
export default defineNitroPlugin(() => {
  setAvatarStore(avatarService.save);
});
