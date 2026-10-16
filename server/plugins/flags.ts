import { defineNitroPlugin } from 'nitropack/runtime';

import { setFlagReader } from '~~/server/lib/flag-gate';
import { flagService } from '~~/server/services/flags';

// Lets server/lib/auth.ts read flags without importing the service (see server/lib/flag-gate.ts).
export default defineNitroPlugin(() => {
  setFlagReader((key) => flagService.isEnabled(key));
});
