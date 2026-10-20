import { defineEventHandler } from 'nuxt/server';

import { shortLinkService } from '~~/server/services/short-links';

import { shortLinkIdParams } from '#shared/schemas/short-links';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const { id } = parseParams(event, shortLinkIdParams);
  return shortLinkService.detail(id);
});
