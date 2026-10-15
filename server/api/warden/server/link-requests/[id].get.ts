import { defineEventHandler } from 'nuxt/server';

import { wardenLinkService } from '~~/server/services/warden/links';

import { wardenIdParams } from '#shared/schemas/warden';

export default defineEventHandler((event) => {
  requireWardenServer(event);
  return wardenLinkService.status(parseParams(event, wardenIdParams).id);
});
