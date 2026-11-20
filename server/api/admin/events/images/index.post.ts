import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { db } from '~~/server/db';
import { auditService } from '~~/server/services/audit';
import { eventImageService } from '~~/server/services/events/images';
import { refuse } from '~~/server/services/events/shared';
import { mediaUrl } from '~~/server/services/events/views';

// An image uploaded from the manager's computer, as multipart form data with a `file` field.
export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const length = Number(event.req.headers.get('content-length') ?? 0);
  if (length > 11 * 1024 * 1024) refuse(400, 'imageTooLarge');
  let file: FormDataEntryValue | null;
  try {
    file = (await event.req.formData()).get('file');
  } catch {
    refuse(400, 'imageUnreadable');
  }
  if (!file || typeof file === 'string') refuse(400, 'imageUnreadable');
  const stored = await eventImageService.ingest(Buffer.from(await file.arrayBuffer()));
  await db.transaction((tx) =>
    auditService.record(tx, {
      action: 'events.image.add',
      actor: { source: 'web', userId: manager.id },
      data: { via: 'upload', key: stored.key },
    }),
  );
  setResponseStatus(event, 201);
  return { ...stored, url: mediaUrl(stored.key) };
});
