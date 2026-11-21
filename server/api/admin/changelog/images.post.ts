import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventImageService } from '~~/server/services/events/images';
import { refuse } from '~~/server/services/events/shared';
import { mediaUrl } from '~~/server/services/events/views';

// An image for a post's body, as multipart form data with a `file` field. No audit entry: the
// post's own edit is audited, and an upload changes nothing a reader sees until it is used.
export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const length = Number(event.req.headers.get('content-length') ?? 0);
  if (length > 6 * 1024 * 1024) refuse(400, 'imageTooLarge');
  let file: FormDataEntryValue | null;
  try {
    file = (await event.req.formData()).get('file');
  } catch {
    refuse(400, 'imageUnreadable');
  }
  if (!file || typeof file === 'string') refuse(400, 'imageUnreadable');
  const stored = await eventImageService.ingestChangelog(Buffer.from(await file.arrayBuffer()));
  setResponseStatus(event, 201);
  return { ...stored, url: mediaUrl(stored.key) };
});
