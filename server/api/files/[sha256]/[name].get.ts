import { Readable } from 'node:stream';

import { createError, defineEventHandler } from 'nuxt/server';

import { fileService } from '~~/server/services/files';

import { fileDownloadParams } from '#shared/schemas/files';

// A file of the library, without sign-in, so the launcher can download it. The address holds the
// SHA-256 of the bytes, which never change, so it is cached for a year. The name after it is only
// there so a download keeps a readable name: the one stored with the file is what is sent.
// Always an attachment, as plain bytes: nothing in a file runs in the browser.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'files');
  const { sha256 } = parseParams(event, fileDownloadParams);
  const file = await fileService.open(sha256);
  if (!file) throw createError({ status: 404, statusText: 'Not Found' });
  return new Response(Readable.toWeb(file.stream) as ReadableStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(file.size),
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${sha256}"`,
    },
  });
});
