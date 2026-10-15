import { defineEventHandler } from 'nuxt/server';

import { wardenManualLinkService } from '~~/server/services/warden/manual-links';

import { wardenMinecraftLookupParams, wardenMinecraftLookupQuery } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { username } = parseParams(event, wardenMinecraftLookupParams);
  const { cracked } = parseQuery(event, wardenMinecraftLookupQuery);
  return wardenManualLinkService.lookup({ username, cracked });
});
