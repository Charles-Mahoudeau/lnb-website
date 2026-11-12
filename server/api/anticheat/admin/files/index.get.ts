import { defineEventHandler } from 'nuxt/server';

import { anticheatRegistryService } from '~~/server/services/anticheat/registry';

import { anticheatFilesQuery } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return anticheatRegistryService.files(parseQuery(event, anticheatFilesQuery));
});
