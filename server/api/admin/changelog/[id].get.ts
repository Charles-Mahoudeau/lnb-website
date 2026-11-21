import { createError, defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { detail } from '~~/server/services/changelog-views';

import { changelogIdParams } from '#shared/schemas/changelog';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { id } = parseParams(event, changelogIdParams);
  const post = await changelogService.getRow(id);
  if (!post)
    throw createError({ status: 404, statusText: 'notFound', data: { problem: 'notFound' } });
  return detail(post);
});
