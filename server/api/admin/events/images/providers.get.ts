import { defineEventHandler } from 'nuxt/server';

import { IMAGE_PROVIDERS } from '~~/server/services/events/providers';
import { flagService } from '~~/server/services/flags';

// Which picker tabs to show: a provider needs its key, and the image search flag on.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const searchOn = await flagService.isEnabled('events.imageSearch');
  return { steamgriddb: searchOn && IMAGE_PROVIDERS.steamgriddb.available() };
});
