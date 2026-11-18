import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

import { ruleParams, ruleRetiredBody } from '#shared/schemas/rules';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { ruleId } = parseParams(event, ruleParams);
  const { retired } = await parseBody(event, ruleRetiredBody);
  await ruleService.setRetired({ actorId: admin.id, id: ruleId, retired });
  setResponseStatus(event, 204);
  return null;
});
