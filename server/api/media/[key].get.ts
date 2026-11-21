import { createError, defineEventHandler } from 'nuxt/server';

import { eventImageService } from '~~/server/services/events/images';

import { mediaParams, mediaQuery } from '#shared/schemas/events';

// Event images, keyed by content, so one never changes once stored: cached for a year, by
// browsers and shared caches alike. Served from our own domain, as the BDE website requires.
export default defineEventHandler(async (event) => {
  const { key } = parseParams(event, mediaParams);
  const { format } = parseQuery(event, mediaQuery);
  // shortcut: the PNG copy is converted on every uncached request, upgrade to a stored copy if it gets busy
  const image =
    format === 'png'
      ? await eventImageService.getPng(key).then((bytes) => bytes && { type: 'image/png', bytes })
      : await eventImageService.get(key);
  if (!image) throw createError({ status: 404, statusText: 'Not Found' });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      'Content-Type': image.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
});
