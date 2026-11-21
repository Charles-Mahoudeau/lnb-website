import { defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { serverPost } from '~~/server/services/changelog-views';

import { changelogPublicListQuery } from '#shared/schemas/changelog';

// The Minecraft server: published posts without their body.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'changelog');
  const { lang, limit, before } = parseQuery(event, changelogPublicListQuery);
  const { posts, next } = await changelogService.listPublished({
    lang: lang ?? 'fr',
    limit,
    before,
  });
  return { posts: posts.map(serverPost), next };
});
