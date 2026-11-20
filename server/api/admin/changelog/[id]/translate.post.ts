import { createError, defineEventHandler } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';
import { detail } from '~~/server/services/changelog-views';
import { translateMarkdown } from '~~/server/services/translation';

import { changelogIdParams } from '#shared/schemas/changelog';

// Translates the stored source text into the other language and keeps it as an unreviewed draft.
export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, changelogIdParams);
  const post = await changelogService.getRow(id);
  if (!post)
    throw createError({ status: 404, statusText: 'notFound', data: { problem: 'notFound' } });
  const source = detail(post).texts[post.sourceLang];
  const [title, summary, body] = await translateMarkdown(
    [source.title, source.summary, source.body],
    post.sourceLang,
  );
  return detail(
    await changelogService.saveTranslation(
      id,
      { title: title ?? '', summary: summary || null, body: body ?? '' },
      admin.id,
    ),
  );
});
