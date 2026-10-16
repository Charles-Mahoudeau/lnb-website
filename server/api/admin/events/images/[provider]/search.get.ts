import { defineEventHandler } from 'nuxt/server';

import { IMAGE_PROVIDERS, ProviderUnavailableError } from '~~/server/services/events/providers';
import { refuse } from '~~/server/services/events/shared';

import { imageProviderParams, imageSearchQuery } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  await requireFlag(event, 'events.imageSearch');
  const { provider } = parseParams(event, imageProviderParams);
  const { q } = parseQuery(event, imageSearchQuery);
  try {
    return { items: await IMAGE_PROVIDERS[provider].searchGames(q) };
  } catch (error) {
    if (error instanceof ProviderUnavailableError) refuse(502, 'providerUnavailable');
    throw error;
  }
});
