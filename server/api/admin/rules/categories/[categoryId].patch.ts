import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

import { ruleCategoryParams, ruleCategoryPatchBody } from '#shared/schemas/rules';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { categoryId } = parseParams(event, ruleCategoryParams);
  const patch = await parseBody(event, ruleCategoryPatchBody);
  await ruleService.updateCategory({ actorId: admin.id, id: categoryId, patch });
  setResponseStatus(event, 204);
  return null;
});
