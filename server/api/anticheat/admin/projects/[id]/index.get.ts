import { defineEventHandler } from 'nuxt/server';

import { anticheatRegistryService } from '~~/server/services/anticheat/registry';

import { anticheatProjectParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { id } = parseParams(event, anticheatProjectParams);
  return anticheatRegistryService.project(id);
});
