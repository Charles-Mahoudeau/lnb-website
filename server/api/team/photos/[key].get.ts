import { createError, defineEventHandler } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamPhotoParams } from '#shared/schemas/team';

// Photos of visible team members only, without sign-in. Every other photo stays behind
// /api/avatars. Keyed by content, so a day of caching is safe.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'team');
  const { key } = parseParams(event, teamPhotoParams);
  const photo = await teamService.photo(key);
  if (!photo) throw createError({ status: 404, statusText: 'Not Found' });
  return new Response(new Uint8Array(photo), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
