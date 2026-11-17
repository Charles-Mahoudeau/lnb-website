import { defineEventHandler } from 'nuxt/server';

import { fileService } from '~~/server/services/files';

import { fileIdParams, fileKindBody } from '#shared/schemas/files';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, fileIdParams);
  const { kind } = await parseBody(event, fileKindBody);
  return fileService.setKind({ id, kind, actorUserId: admin.id });
});
