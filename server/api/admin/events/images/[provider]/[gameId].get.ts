import { defineEventHandler } from 'nuxt/server';

import { IMAGE_PROVIDERS, ProviderUnavailableError } from '~~/server/services/events/providers';
import { refuse } from '~~/server/services/events/shared';

import { imageListQuery, imageProviderGameParams } from '#shared/schemas/events';

// A game's art, with thumbnails that go through the site, so the page never loads them from
// the provider.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  await requireFlag(event, 'events.imageSearch');
  const { provider, gameId } = parseParams(event, imageProviderGameParams);
  const { kind } = parseQuery(event, imageListQuery);
  try {
    const images = await IMAGE_PROVIDERS[provider].listImages(gameId, kind);
    return {
      items: images.map((image) => ({
        ...image,
        thumb: `/api/admin/events/images/thumb?url=${encodeURIComponent(image.thumb)}`,
      })),
    };
  } catch (error) {
    if (error instanceof ProviderUnavailableError) refuse(502, 'providerUnavailable');
    throw error;
  }
});
