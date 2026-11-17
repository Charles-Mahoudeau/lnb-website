import { defineEventHandler } from 'nuxt/server';

import { minecraftEventService } from '~~/server/services/minecraft-events';
import { questServerService } from '~~/server/services/quests/server';

import { questUuidParams, questWebClaimBody } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.quests');
  const { id } = parseParams(event, questUuidParams);
  const body = await parseBody(event, questWebClaimBody);
  const claimed = await questServerService.claim(id, {
    idempotencyKey: body.idempotencyKey,
    userId: user.id,
    actor: { source: 'web' },
  });
  // The game's quest screen and its red badge follow at once.
  await minecraftEventService.emitToPlayers('quests', 'player', [user.id]);
  return claimed;
});
