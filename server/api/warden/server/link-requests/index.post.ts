import { defineEventHandler } from 'nuxt/server';

import { wardenLinkService } from '~~/server/services/warden/links';

import { wardenLinkRequestBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  return wardenLinkService.create(await parseBody(event, wardenLinkRequestBody));
});
