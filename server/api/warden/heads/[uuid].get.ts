import { createError, defineEventHandler } from 'nuxt/server';

import { wardenHeadService } from '~~/server/services/warden/heads';

import { wardenUuidParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const { uuid } = parseParams(event, wardenUuidParams);
  const png = await wardenHeadService.get(uuid);
  if (!png) throw createError({ status: 404, statusText: 'Not Found' });
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
