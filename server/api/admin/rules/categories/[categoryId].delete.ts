import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

import { ruleCategoryParams } from '#shared/schemas/rules';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { categoryId } = parseParams(event, ruleCategoryParams);
  await ruleService.removeCategory({ actorId: admin.id, id: categoryId });
  setResponseStatus(event, 204);
  return null;
});
