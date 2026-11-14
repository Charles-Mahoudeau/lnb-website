import { createError, defineEventHandler } from 'nuxt/server';

import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

import { gamesplanetCoverParams } from '#shared/schemas/gamesplanet';

// Our copies of Gamesplanet covers, keyed by content, so one never changes once stored. Not behind
// the flag: the admin page previews covers even while the promotion is off.
export default defineEventHandler(async (event) => {
  const { key } = parseParams(event, gamesplanetCoverParams);
  const bytes = await gamesplanetDealsService.getCover(key);
  if (!bytes) throw createError({ status: 404, statusText: 'Not Found' });
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
