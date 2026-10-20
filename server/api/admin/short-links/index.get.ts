import { defineEventHandler } from 'nuxt/server';

import { siteUrl } from '~~/server/lib/site';
import { shortLinkService } from '~~/server/services/short-links';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return shortLinkService.listAdmin(siteUrl('/'));
});
