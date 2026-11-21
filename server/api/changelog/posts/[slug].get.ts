import { createError, defineEventHandler } from 'nuxt/server';

import { changelogService, renderBody } from '~~/server/services/changelog';
import { publicPost } from '~~/server/services/changelog-views';

import { changelogPublicPostQuery, changelogSlugParams } from '#shared/schemas/changelog';

// Public: one published post as HTML, with the posts just older and newer.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'changelog');
  const { slug } = parseParams(event, changelogSlugParams);
  const lang = parseQuery(event, changelogPublicPostQuery).lang ?? 'fr';
  const post = await changelogService.get({ slug }, { lang, publishedOnly: true });
  if (!post) {
    throw createError({ status: 404, statusText: 'notFound', data: { problem: 'notFound' } });
  }
  const { older, newer } = await changelogService.neighbours(post, lang);
  const link = (n: typeof older) => (n ? { slug: n.slug, title: n.title } : null);
  return {
    ...publicPost(post),
    html: renderBody(post.body),
    older: link(older),
    newer: link(newer),
  };
});
