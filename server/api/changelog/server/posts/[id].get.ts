import { createError, defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { serverDetail } from '~~/server/services/changelog-views';

import { changelogIdParams, changelogPublicPostQuery } from '#shared/schemas/changelog';

// The Minecraft server: one published post with its Markdown body.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'changelog');
  const { id } = parseParams(event, changelogIdParams);
  const lang = parseQuery(event, changelogPublicPostQuery).lang ?? 'fr';
  const post = await changelogService.get({ id }, { lang, publishedOnly: true });
  if (!post) {
    throw createError({ status: 404, statusText: 'notFound', data: { problem: 'notFound' } });
  }
  return serverDetail(post);
});
