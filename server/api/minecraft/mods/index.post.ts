import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modSuggestionService } from '~~/server/services/mods/suggestions';

import { modSuggestBody } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'modList.suggestions');
  const body = await parseBody(event, modSuggestBody);
  const created = await modSuggestionService.suggest({ actorId: user.id, ...body });
  setResponseStatus(event, 201);
  return created;
});
