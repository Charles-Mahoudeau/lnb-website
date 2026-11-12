import { defineEventHandler } from 'nuxt/server';

import { anticheatRegistryService } from '~~/server/services/anticheat/registry';

import { anticheatFileParams, anticheatFilePlayersQuery } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { sha512 } = parseParams(event, anticheatFileParams);
  return anticheatRegistryService.filePlayers(sha512, parseQuery(event, anticheatFilePlayersQuery));
});
