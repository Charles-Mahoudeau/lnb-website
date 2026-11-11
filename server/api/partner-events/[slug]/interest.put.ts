import { defineEventHandler } from 'nuxt/server';

import { partnerEventService } from '~~/server/services/partner-events';

import { partnerEventParams, partnerInterestBody } from '#shared/schemas/partner-events';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'partnerEvents');
  const { slug } = parseParams(event, partnerEventParams);
  const body = await parseBody(event, partnerInterestBody);
  return partnerEventService.saveInterest({ userId: user.id, slug, body });
});
