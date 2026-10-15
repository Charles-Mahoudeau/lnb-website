import { defineEventHandler } from 'nuxt/server';

import { wardenPlayerService } from '~~/server/services/warden/players';

import { wardenUuidParams } from '#shared/schemas/warden';

export default defineEventHandler((event) => {
  requireWardenServer(event);
  return wardenPlayerService.lookup(parseParams(event, wardenUuidParams).uuid);
});
