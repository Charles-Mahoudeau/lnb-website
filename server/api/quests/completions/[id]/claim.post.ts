import { defineEventHandler } from 'nuxt/server';

import { questServerService } from '~~/server/services/quests/server';

import { questUuidParams, questWebClaimBody } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.quests');
  const { id } = parseParams(event, questUuidParams);
  const body = await parseBody(event, questWebClaimBody);
  return questServerService.claim(id, {
    idempotencyKey: body.idempotencyKey,
    userId: user.id,
    actor: { source: 'web' },
  });
});
