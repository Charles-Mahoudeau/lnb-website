import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

import { ruleMoveBody, ruleParams } from '#shared/schemas/rules';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { ruleId } = parseParams(event, ruleParams);
  const { direction } = await parseBody(event, ruleMoveBody);
  await ruleService.moveRule({ actorId: admin.id, id: ruleId, direction });
  setResponseStatus(event, 204);
  return null;
});
