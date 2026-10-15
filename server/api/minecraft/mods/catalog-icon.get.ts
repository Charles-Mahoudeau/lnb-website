import { createError, defineEventHandler } from 'nuxt/server';

import { modIconService } from '~~/server/services/mods/icons';

import { modCatalogIconQuery } from '#shared/schemas/mods';

// Icons of search results, fetched by the site from Modrinth's or CurseForge's image host only.
export default defineEventHandler(async (event) => {
  await requireUser(event);
  const { src } = parseQuery(event, modCatalogIconQuery);
  const icon = await modIconService.catalog(src);
  if (!icon) throw createError({ status: 404, statusText: 'Not Found' });
  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      'Content-Type': icon.type,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
