import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

import { ruleCategoryParams, ruleMoveBody } from '#shared/schemas/rules';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { categoryId } = parseParams(event, ruleCategoryParams);
  const { direction } = await parseBody(event, ruleMoveBody);
  await ruleService.moveCategory(categoryId, direction);
  setResponseStatus(event, 204);
  return null;
});
