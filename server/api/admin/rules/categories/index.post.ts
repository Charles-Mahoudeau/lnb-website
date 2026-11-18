import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

import { ruleCategoryBody } from '#shared/schemas/rules';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const body = await parseBody(event, ruleCategoryBody);
  const created = await ruleService.createCategory({ actorId: admin.id, body });
  setResponseStatus(event, 201);
  return created;
});
