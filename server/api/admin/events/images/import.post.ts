import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventImageService } from '~~/server/services/events/images';
import { IMAGE_PROVIDERS } from '~~/server/services/events/providers';
import { mediaUrl } from '~~/server/services/events/views';

import { eventImageImportBody } from '#shared/schemas/events';

// An image from a link, or picked from a provider: the server downloads it once and keeps it.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const body = await parseBody(event, eventImageImportBody);
  const hosts = body.source === 'url' ? undefined : IMAGE_PROVIDERS[body.source].hosts;
  const stored = await eventImageService.importUrl(body.url, hosts);
  setResponseStatus(event, 201);
  return { ...stored, url: mediaUrl(stored.key) };
});
