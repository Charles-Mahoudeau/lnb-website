import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { fileService } from '~~/server/services/files';

import { fileIdParams } from '#shared/schemas/files';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, fileIdParams);
  await fileService.remove({ id, actorUserId: admin.id });
  setResponseStatus(event, 204);
  return null;
});
