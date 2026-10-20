import { defineEventHandler } from 'nuxt/server';

import { shortLinkService } from '~~/server/services/short-links';

import { shortLinkPublicParams } from '#shared/schemas/short-links';

// Public: the page behind a refused short link asks what to say. No destination here.
export default defineEventHandler((event) => {
  const { shortId } = parseParams(event, shortLinkPublicParams);
  return shortLinkService.publicInfo(shortId);
});
