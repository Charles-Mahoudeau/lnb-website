import { createError, defineEventHandler } from 'nuxt/server';

import { partnerService } from '~~/server/services/partners';

import { partnerLogoParams } from '#shared/schemas/partners';

// Partner logos, keyed by content, so one never changes once stored. Not behind the page's flag:
// the admin form previews a logo before the partner is saved. SVG is served as an image only,
// and the policy stops anything inside it from running if the file is opened on its own.
export default defineEventHandler(async (event) => {
  const { key } = parseParams(event, partnerLogoParams);
  const logo = await partnerService.getLogo(key);
  if (!logo) throw createError({ status: 404, statusText: 'Not Found' });
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      'Content-Type': logo.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
