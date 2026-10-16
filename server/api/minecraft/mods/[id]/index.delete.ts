import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modSuggestionService } from '~~/server/services/mods/suggestions';

import { modIdParams } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'modList');
  const { id } = parseParams(event, modIdParams);
  await modSuggestionService.withdraw({ actorId: user.id, modId: id });
  setResponseStatus(event, 204);
  return null;
});
