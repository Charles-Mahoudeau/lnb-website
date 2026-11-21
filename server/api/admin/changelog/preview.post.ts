import { defineEventHandler } from 'nuxt/server';

import { renderBody } from '~~/server/services/changelog';

import { changelogPreviewBody } from '#shared/schemas/changelog';

// The editor's "On the site" mode: the same renderer as the public page.
export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { markdown } = await parseBody(event, changelogPreviewBody);
  return { html: renderBody(markdown) };
});
