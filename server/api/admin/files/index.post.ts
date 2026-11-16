import { Readable } from 'node:stream';

import { createError, defineEventHandler, setResponseStatus } from 'nuxt/server';

import { fileService } from '~~/server/services/files';

import { fileUploadQuery } from '#shared/schemas/files';

// The file is the raw request body, not multipart, so it can be streamed to disk while it is
// hashed. The name and kind come in the query. The browser sends it with its own content type,
// which is ignored: what a file is follows from its name and its first bytes.
export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { name, kind } = parseQuery(event, fileUploadQuery);
  const body = event.req.body;
  if (!body) {
    throw createError({ status: 400, statusText: 'fileEmpty', data: { problem: 'fileEmpty' } });
  }
  const length = Number(event.req.headers.get('content-length'));
  const stored = await fileService.ingest({
    body: Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
    name,
    kind,
    contentLength: Number.isFinite(length) && length > 0 ? length : null,
    actorUserId: admin.id,
  });
  setResponseStatus(event, 201);
  return stored;
});
