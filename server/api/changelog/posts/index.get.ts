import { defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { publicPost } from '~~/server/services/changelog-views';

import { changelogPublicListQuery } from '#shared/schemas/changelog';

// Public: the changelog page shows without signing in.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'changelog');
  const { lang, limit, before } = parseQuery(event, changelogPublicListQuery);
  const { posts, next } = await changelogService.listPublished({
    lang: lang ?? 'fr',
    limit,
    before,
  });
  return { posts: posts.map(publicPost), next };
});
