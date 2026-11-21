import { createError, defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { serverDetail } from '~~/server/services/changelog-views';

import { changelogIdParams, changelogPublicPostQuery } from '#shared/schemas/changelog';

// The game's title screen: one published post with its Markdown and blocks, no sign-in.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'changelog');
  const { id } = parseParams(event, changelogIdParams);
  const lang = parseQuery(event, changelogPublicPostQuery).lang ?? 'fr';
  const post = await changelogService.get({ id }, { lang, publishedOnly: true });
  if (!post) {
    throw createError({ status: 404, statusText: 'notFound', data: { problem: 'notFound' } });
  }
  event.res.headers.set('Cache-Control', 'public, max-age=60');
  return serverDetail(post);
});
