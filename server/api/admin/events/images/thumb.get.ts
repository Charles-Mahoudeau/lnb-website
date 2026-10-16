import { createHash } from 'node:crypto';

import { defineCachedFunction } from 'nitropack/runtime';
import { createError, defineEventHandler } from 'nuxt/server';

import { IMAGE_PROVIDERS } from '~~/server/services/events/providers';

import { imageThumbQuery } from '#shared/schemas/events';

// A provider's preview image, fetched by the server from that provider's hosts only, and cached
// for a day. Previews are small: 2 MB at most.

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const HOSTS = new Set(Object.values(IMAGE_PROVIDERS).flatMap((provider) => [...provider.hosts]));

const fetchThumb = defineCachedFunction(
  async (url: string): Promise<{ type: string; data: string } | undefined> => {
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      if (!response.ok || !TYPES.has(type)) return undefined;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_BYTES) return undefined;
      return { type, data: bytes.toString('base64') };
    } catch {
      return undefined;
    }
  },
  {
    name: 'event-image-thumb',
    maxAge: 24 * 60 * 60,
    getKey: (url: string) => createHash('sha256').update(url).digest('hex'),
    validate: (entry) => entry.value !== undefined,
  },
);

export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { url } = parseQuery(event, imageThumbQuery);
  if (!HOSTS.has(new URL(url).host)) throw createError({ status: 404, statusText: 'Not Found' });
  const thumb = await fetchThumb(url);
  if (!thumb) throw createError({ status: 404, statusText: 'Not Found' });
  return new Response(new Uint8Array(Buffer.from(thumb.data, 'base64')), {
    headers: {
      'Content-Type': thumb.type,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
