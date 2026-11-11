import { defineEventHandler } from 'nuxt/server';

import { partnerEventAdminService } from '~~/server/services/partner-events-admin';

import { partnerAnnounceImpactBody, partnerEventParams } from '#shared/schemas/partner-events';

// How many people the announcement would notify, for the confirmation. Writes nothing.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { slug } = parseParams(event, partnerEventParams);
  const { locale } = await parseBody(event, partnerAnnounceImpactBody);
  return partnerEventAdminService.announceImpact({ slug, locale });
});
