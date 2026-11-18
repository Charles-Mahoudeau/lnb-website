import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

import { ruleParams, rulePatchBody } from '#shared/schemas/rules';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { ruleId } = parseParams(event, ruleParams);
  const patch = await parseBody(event, rulePatchBody);
  await ruleService.updateRule({ actorId: admin.id, id: ruleId, patch });
  setResponseStatus(event, 204);
  return null;
});
