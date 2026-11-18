import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

import { ruleBody } from '#shared/schemas/rules';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const body = await parseBody(event, ruleBody);
  const created = await ruleService.createRule({ actorId: admin.id, body });
  setResponseStatus(event, 201);
  return created;
});
