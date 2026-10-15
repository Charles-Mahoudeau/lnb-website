import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modSuggestionService } from '~~/server/services/mods/suggestions';

import { modIdParams, modReasonBody } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { id } = parseParams(event, modIdParams);
  const { reason } = await parseBody(event, modReasonBody);
  await modSuggestionService.editReason({ actorId: user.id, modId: id, reason });
  setResponseStatus(event, 204);
  return null;
});
