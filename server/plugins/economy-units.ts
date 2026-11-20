import { defineNitroPlugin } from 'nitropack/runtime';

import { centsResponseToLegacy } from '~~/server/lib/economy-units';

// The answer side of `X-Economy-Units` (see server/middleware/economy-units.ts): services answer
// in cents, and a legacy caller gets whole LNBits, rounded down. Replays of an idempotency key
// come out of the same stored cents, so both modes agree.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    if (event.context.economyUnits !== 'lnbits') return;
    const path = new URL(event.path, 'http://localhost').pathname;
    response.body = centsResponseToLegacy(path, response.body);
  });
});
