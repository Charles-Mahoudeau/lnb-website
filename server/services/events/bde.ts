import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import { event, eventRoom } from '~~/server/db/schema';
import { bdeEnv } from '~~/server/lib/bde-env';
import { siteUrl } from '~~/server/lib/site';
import { flagService } from '~~/server/services/flags';

import { descriptionText } from './markdown';
import { bdeProblems, nextBdeAttempt, toBdePayload } from './rules';
import { refuse } from './shared';
import { mediaUrl } from './views';

// Pushes events to the BDE website, so they show there too, with their "S'inscrire" button
// leading to our page. See docs/bde/external_events_api.md. An event with bdeSync on is put
// there (hidden while it's a draft), and taken down when it's cancelled or bdeSync goes off.
//
// Saving an event marks it pending and tries at once. A network error or a 5xx is retried by the
// events:bde-sync task, after 1, 5 and 30 minutes, then hourly. A refusal (422, or our own check
// of the BDE's rules) is marked failed with the BDE's messages and waits for the event to change.

const TIMEOUT_MS = 8000;

/** Marks an event for a push, in the caller's transaction, after a change. */
async function markPending(tx: Tx, eventId: string): Promise<void> {
  await tx
    .update(event)
    .set({
      bdeStatus: 'pending',
      bdeAttempts: 0,
      bdeNextAttemptAt: new Date(),
      bdeLastError: null,
      // A sync result isn't an edit.
      updatedAt: sql`${event.updatedAt}`,
    })
    .where(
      and(
        eq(event.id, eventId),
        // Nothing to do for an event that was never there and shouldn't be.
        sql`(${event.bdeSync} OR ${event.bdeStatus} IS NOT NULL OR ${event.bdePageUrl} IS NOT NULL)`,
      ),
    );
}

type Outcome =
  | { kind: 'synced'; pageUrl: string }
  | { kind: 'removed' }
  | { kind: 'refused'; errors: Record<string, unknown> }
  | { kind: 'retry'; errors: Record<string, unknown> };

async function call(method: 'PUT' | 'DELETE', id: string, body?: unknown): Promise<Response> {
  const { BDE_API_TOKEN, BDE_API_URL } = bdeEnv();
  return fetch(`${BDE_API_URL}/events/${encodeURIComponent(id)}`, {
    method,
    headers: {
      Authorization: `Bearer ${BDE_API_TOKEN ?? ''}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function errorsOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const json = (await response.json()) as { errors?: Record<string, unknown> };
    return { status: response.status, ...(json.errors ?? {}) };
  } catch {
    return { status: response.status };
  }
}

/** One attempt: puts the event there, or takes it down. */
async function attempt(eventId: string): Promise<Outcome | null> {
  const [row] = await db
    .select({ event, room: eventRoom })
    .from(event)
    .innerJoin(eventRoom, eq(eventRoom.id, event.roomId))
    .where(eq(event.id, eventId));
  if (!row) return null;
  const e = row.event;
  const wanted = e.bdeSync && !e.cancelledAt;

  try {
    if (!wanted) {
      const response = await call('DELETE', e.id);
      if (response.status === 204 || response.status === 404) return { kind: 'removed' };
      return response.status >= 500
        ? { kind: 'retry', errors: await errorsOf(response) }
        : { kind: 'refused', errors: await errorsOf(response) };
    }
    const payload = toBdePayload({
      name: e.name,
      descriptionText: descriptionText(e.description),
      room: row.room,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      hidden: e.hidden,
      price: e.price,
      pageUrl: siteUrl(`/events/${e.id}`),
      embedUrl: e.embedCropKey ? siteUrl(mediaUrl(e.embedCropKey)) : null,
    });
    const problems = bdeProblems(payload);
    if (Object.keys(problems).length) return { kind: 'refused', errors: problems };
    const response = await call('PUT', e.id, payload);
    if (response.ok) {
      const json = (await response.json()) as { data?: { page_url?: string } };
      return { kind: 'synced', pageUrl: json.data?.page_url ?? '' };
    }
    return response.status >= 500 || response.status === 429
      ? { kind: 'retry', errors: await errorsOf(response) }
      : { kind: 'refused', errors: await errorsOf(response) };
  } catch {
    return { kind: 'retry', errors: { detail: 'unreachable' } };
  }
}

/**
 * Pushes an event now, if it's pending and the feature is on, and records how it went. A save in
 * the meantime made it pending again, so the result is dropped and the next run pushes the new
 * version.
 */
async function sync(eventId: string): Promise<void> {
  if (!bdeEnv().BDE_API_TOKEN || !(await flagService.isEnabled('events.bdeSync'))) return;
  const [before] = await db
    .select({ updatedAt: event.updatedAt, attempts: event.bdeAttempts, status: event.bdeStatus })
    .from(event)
    .where(eq(event.id, eventId));
  if (before?.status !== 'pending') return;
  const outcome = await attempt(eventId);
  if (!outcome) return;
  const now = new Date();
  const attempts = before.attempts + 1;
  const keep = { updatedAt: sql`${event.updatedAt}` };
  const set =
    outcome.kind === 'synced'
      ? {
          bdeStatus: 'synced' as const,
          bdeAttempts: 0,
          bdeNextAttemptAt: null,
          bdeLastError: null,
          bdePageUrl: outcome.pageUrl || null,
        }
      : outcome.kind === 'removed'
        ? {
            bdeStatus: null,
            bdeAttempts: 0,
            bdeNextAttemptAt: null,
            bdeLastError: null,
            bdePageUrl: null,
          }
        : outcome.kind === 'refused'
          ? {
              bdeStatus: 'failed' as const,
              bdeAttempts: attempts,
              bdeNextAttemptAt: null,
              bdeLastError: outcome.errors,
            }
          : {
              bdeStatus: 'pending' as const,
              bdeAttempts: attempts,
              bdeNextAttemptAt: nextBdeAttempt(attempts, now),
              bdeLastError: outcome.errors,
            };
  await db
    .update(event)
    .set({ ...set, ...keep })
    .where(
      and(
        eq(event.id, eventId),
        eq(event.updatedAt, before.updatedAt),
        eq(event.bdeStatus, 'pending'),
      ),
    );
}

/** The pending pushes that are due. Run every minute by events:bde-sync. */
async function processDue(now = new Date()): Promise<number> {
  const due = await db
    .select({ id: event.id })
    .from(event)
    .where(
      and(
        eq(event.bdeStatus, 'pending'),
        isNotNull(event.bdeNextAttemptAt),
        lte(event.bdeNextAttemptAt, now),
      ),
    )
    .limit(20);
  for (const { id } of due) await sync(id);
  return due.length;
}

/** Tries again by hand, such as after fixing what the BDE refused. */
async function retry(eventId: string): Promise<void> {
  const [row] = await db.select({ id: event.id }).from(event).where(eq(event.id, eventId));
  if (!row) refuse(404, 'notFound');
  await db.transaction((tx) => markPending(tx, eventId));
  await sync(eventId);
}

/**
 * Before an event is deleted: takes it down from the BDE website first, since nothing could
 * retry once the row is gone. Refused while the BDE website can't be reached.
 */
async function removeBeforeDelete(row: typeof event.$inferSelect): Promise<void> {
  if (!row.bdePageUrl && row.bdeStatus !== 'synced') return;
  if (!bdeEnv().BDE_API_TOKEN) return;
  try {
    const response = await call('DELETE', row.id);
    if (response.status === 204 || response.status === 404) return;
  } catch {
    // Falls through to the refusal.
  }
  refuse(502, 'bdeUnavailable');
}

/** Whether pushing is set up, for the form's switch. */
function configured(): boolean {
  return !!bdeEnv().BDE_API_TOKEN;
}

export const bdeSyncService = {
  markPending,
  sync,
  processDue,
  retry,
  removeBeforeDelete,
  configured,
};
