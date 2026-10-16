import { createError, defineEventHandler } from 'nuxt/server';

import { modIconService } from '~~/server/services/mods/icons';
import { modListService } from '~~/server/services/mods/list';

import { modIdParams } from '#shared/schemas/mods';

// A mod's icon never changes once it's stored, so it's cached for a year.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'modList.icons');
  const { id } = parseParams(event, modIdParams);
  const key = await modListService.iconKey(id);
  const icon = key ? await modIconService.get(key) : undefined;
  if (!icon) throw createError({ status: 404, statusText: 'Not Found' });
  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      'Content-Type': icon.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
