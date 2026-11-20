import { defineEventHandler } from 'nuxt/server';

import { translationAvailable } from '~~/server/services/translation';

// Whether the Translate button can work: the DeepL key is set.
export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return { available: translationAvailable() };
});
