import { defineEventHandler } from 'nuxt/server';

import { partnerEventAdminService } from '~~/server/services/partner-events-admin';

import { partnerEventParams } from '#shared/schemas/partner-events';

// Settings, games with their referent, teams and the interest list. Personal data: managers only.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { slug } = parseParams(event, partnerEventParams);
  return partnerEventAdminService.view(slug);
});
