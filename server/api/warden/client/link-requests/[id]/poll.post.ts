import { defineEventHandler } from 'nuxt/server';

import { wardenDeviceLinkService } from '~~/server/services/warden/device-links';

import { wardenClientPollBody, wardenIdParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  await requireFlag(event, 'warden.clientApi');
  const { id } = parseParams(event, wardenIdParams);
  const { pollSecret } = await parseBody(event, wardenClientPollBody);
  return wardenDeviceLinkService.poll(id, pollSecret);
});
