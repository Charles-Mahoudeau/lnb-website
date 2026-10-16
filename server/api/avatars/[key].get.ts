import { createError, defineEventHandler } from 'nuxt/server';

import { avatarService } from '~~/server/services/avatars';

import { avatarParams } from '#shared/schemas/avatars';

// Keyed by content, so a photo never changes once stored. Students' photos are for signed-in
// users only, so browsers may cache them but shared caches may not.
export default defineEventHandler(async (event) => {
  await requireUser(event);
  const { key } = parseParams(event, avatarParams);
  const photo = await avatarService.get(key);
  if (!photo) throw createError({ status: 404, statusText: 'Not Found' });
  return new Response(new Uint8Array(photo), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
