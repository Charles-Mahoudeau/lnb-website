import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modSuggestionService } from '~~/server/services/mods/suggestions';

import { modIdParams } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { id } = parseParams(event, modIdParams);
  await modSuggestionService.dismissRemoval({ actorId: user.id, modId: id });
  setResponseStatus(event, 204);
  return null;
});
