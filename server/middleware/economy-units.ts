import { createError, defineEventHandler } from 'nuxt/server';

import { ECONOMY_UNITS_HEADER, unitsOfHeader, usesEconomyUnits } from '~~/server/lib/economy-units';

// Reads `X-Economy-Units` on the Minecraft server routes and keeps the answer on the event, for
// parseBody (requests) and the response hook in server/plugins/economy-units.ts. See
// docs/economy.md, Units.

declare module 'h3' {
  interface H3EventContext {
    /** `cents`, or `lnbits` (legacy): the units of money of this Minecraft server request. */
    economyUnits?: 'cents' | 'lnbits';
  }
}

export default defineEventHandler((event) => {
  const path = new URL(event.req.url, 'http://localhost').pathname;
  if (!usesEconomyUnits(path)) return;
  const units = unitsOfHeader(event.req.headers.get(ECONOMY_UNITS_HEADER));
  if (!units) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      data: { problem: 'invalidUnits' },
    });
  }
  event.context.economyUnits = units;
  event.res.headers.set('X-Economy-Units', units === 'cents' ? 'cents' : 'lnbits');
});
