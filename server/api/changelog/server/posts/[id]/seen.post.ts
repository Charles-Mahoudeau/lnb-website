import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { changelogService } from '~~/server/services/changelog';

import { changelogIdParams, changelogSeenBody } from '#shared/schemas/changelog';

// The Minecraft server: a player has seen a post. Idempotent.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'changelog');
  const { id } = parseParams(event, changelogIdParams);
  const { player } = await parseBody(event, changelogSeenBody);
  await changelogService.markSeen(id, player);
  setResponseStatus(event, 204);
  return null;
});
