import { defineEventHandler } from 'nuxt/server';

import { partnerEventService } from '~~/server/services/partner-events';

import { partnerEventParams } from '#shared/schemas/partner-events';

// Public, like the page. A signed-in student also gets their own interest.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'partnerEvents');
  const { slug } = parseParams(event, partnerEventParams);
  const session = await getAuthSession(event);
  return partnerEventService.view(slug, session?.user.id ?? null);
});
