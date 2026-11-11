import { createError, defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventImageService } from '~~/server/services/events/images';

// A hero or card image uploaded from the manager's computer, as multipart form data with a `file`
// field. It is stored right away, and attached with the settings routes.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const refuse = (problem: 'imageTooLarge' | 'imageUnreadable') =>
    createError({ status: 400, statusText: problem, data: { problem } });
  if (Number(event.req.headers.get('content-length') ?? 0) > 11 * 1024 * 1024) {
    throw refuse('imageTooLarge');
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await event.req.formData()).get('file');
  } catch {
    throw refuse('imageUnreadable');
  }
  if (!file || typeof file === 'string') throw refuse('imageUnreadable');
  const stored = await eventImageService.ingest(Buffer.from(await file.arrayBuffer()));
  setResponseStatus(event, 201);
  return { key: stored.key, url: `/api/media/${stored.key}` };
});
