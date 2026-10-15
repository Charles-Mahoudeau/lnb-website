import { defineEventHandler } from 'nuxt/server';

import { modListService } from '~~/server/services/mods/list';

import { modIdParams, modVoteBody } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { id } = parseParams(event, modIdParams);
  const { value } = await parseBody(event, modVoteBody);
  return modListService.vote({ actorId: user.id, modId: id, value });
});
