import { and, eq, gt, isNull, lt } from 'drizzle-orm';

import { db } from '~~/server/db';
import { event, eventRegistration } from '~~/server/db/schema';

import { pushQueueService } from './queue';
import { dueReminderOffsets, reminderKey } from './rules';

// Queues the reminders whose moment has come. push:deliver runs this every minute, before it
// sends. An event lists its own offsets (minutes before the start). A reminder is queued once per
// person, offset and start time, so a moved event reminds again at its new time.

/** The longest offset is a week, so nothing further out can be due. */
const HORIZON_MS = 7 * 24 * 60 * 60 * 1000 + 60_000;

async function queueDue(now = new Date()): Promise<number> {
  if (!(await pushQueueService.allowed('reminder'))) return 0;
  const upcoming = await db
    .select({
      id: event.id,
      startsAt: event.startsAt,
      reminderOffsets: event.reminderOffsets,
    })
    .from(event)
    .where(
      and(
        eq(event.hidden, false),
        isNull(event.cancelledAt),
        gt(event.startsAt, now),
        lt(event.startsAt, new Date(now.getTime() + HORIZON_MS)),
      ),
    );
  let queued = 0;
  for (const row of upcoming) {
    for (const offset of dueReminderOffsets(row.startsAt, row.reminderOffsets, now)) {
      const going = await db
        .select({ userId: eventRegistration.userId })
        .from(eventRegistration)
        .where(
          and(eq(eventRegistration.eventId, row.id), eq(eventRegistration.status, 'registered')),
        );
      queued += await pushQueueService.enqueue(db, {
        kind: 'reminder',
        eventId: row.id,
        userIds: going.map((r) => r.userId),
        params: { offset },
        dedupe: (userId) => reminderKey(row.id, userId, offset, row.startsAt),
        now,
      });
    }
  }
  return queued;
}

export const pushReminderService = { queueDue };
