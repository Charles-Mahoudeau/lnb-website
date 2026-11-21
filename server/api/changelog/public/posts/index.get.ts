import { defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { serverPost } from '~~/server/services/changelog-views';

import { changelogPublicListQuery } from '#shared/schemas/changelog';

// The game's title screen: published posts without their body, no sign-in, no seen tracking.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'changelog');
  const { lang, limit, before } = parseQuery(event, changelogPublicListQuery);
  const { posts, next } = await changelogService.listPublished({
    lang: lang ?? 'fr',
    limit,
    before,
  });
  event.res.headers.set('Cache-Control', 'public, max-age=60');
  return { posts: posts.map(serverPost), next };
});
