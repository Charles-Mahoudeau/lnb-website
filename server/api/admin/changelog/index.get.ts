import { defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { listItem } from '~~/server/services/changelog-views';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return { posts: (await changelogService.listAdmin()).map(listItem) };
});
