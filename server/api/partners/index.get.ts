import { defineEventHandler } from 'nuxt/server';

import { partnerService } from '~~/server/services/partners';

// Public: the partners page shows without signing in.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'partners');
  return partnerService.listPublic();
});
