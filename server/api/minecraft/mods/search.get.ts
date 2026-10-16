import { defineEventHandler } from 'nuxt/server';

import { modSuggestionService } from '~~/server/services/mods/suggestions';

import { modSearchQuery } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'modList.search');
  const { q } = parseQuery(event, modSearchQuery);
  return { items: await modSuggestionService.search({ actorId: user.id, query: q }) };
});
