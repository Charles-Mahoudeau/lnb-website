import { createError, defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerService } from '~~/server/services/partners';

// A logo uploaded from the admin's computer, as multipart form data with a `file` field. It is
// stored right away and attached to a partner when the form is saved.
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const refuse = (problem: 'imageTooLarge' | 'imageUnreadable') =>
    createError({ status: 400, statusText: problem, data: { problem } });
  if (Number(event.req.headers.get('content-length') ?? 0) > 2 * 1024 * 1024) {
    throw refuse('imageTooLarge');
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await event.req.formData()).get('file');
  } catch {
    throw refuse('imageUnreadable');
  }
  if (!file || typeof file === 'string') throw refuse('imageUnreadable');
  const stored = await partnerService.ingestLogo(Buffer.from(await file.arrayBuffer()));
  setResponseStatus(event, 201);
  return stored;
});
