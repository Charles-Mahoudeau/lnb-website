import { defineEventHandler } from 'nuxt/server';

import { eventImageService } from '~~/server/services/events/images';

import { posterArtQuery } from '#shared/schemas/posters';

// The treated art of an Art title poster, made on first use. The same query always gives the
// same picture, so browsers keep it.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { key, treatment, tint } = parseQuery(event, posterArtQuery);
  const bytes = await eventImageService.treated(key, treatment, tint);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
});
