import { defineNitroPlugin } from 'nitropack/runtime';

import { setRateLimitModeReader } from '~~/server/lib/rate-limit-gate';
import { rateLimitModeService } from '~~/server/services/rate-limit-mode';

// Lets server/lib/auth.ts follow the rate limit mode without importing the service (see
// server/lib/rate-limit-gate.ts).
export default defineNitroPlugin(() => {
  setRateLimitModeReader(() => rateLimitModeService.current());
});
