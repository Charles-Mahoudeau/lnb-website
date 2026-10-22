import { defineEventHandler } from 'nuxt/server';

import { wardenDeviceLinkService } from '~~/server/services/warden/device-links';

import { wardenClientLinkRequestBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  await requireFlag(event, 'warden.clientApi');
  return wardenDeviceLinkService.create(await parseBody(event, wardenClientLinkRequestBody));
});
