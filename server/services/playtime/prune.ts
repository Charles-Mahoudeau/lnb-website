import { and, inArray, isNotNull, lt, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { playtimeLedger, playtimeNotice, wardenSession } from '~~/server/db/schema';

import { addDays, mondayOf, parisDate } from '#shared/utils/paris-time';

// The nightly clean-up of the playtime tables. See docs/playtime.md.

/** Ledger rows are kept 26 weeks, which covers the admin's eight weeks with room to spare. */
export const LEDGER_KEEP_WEEKS = 26;

/**
 * Deletes ledger rows of weeks older than 26 weeks before the current Monday, and the warnings
 * recorded for sessions that have ended (nothing sends one again). Grants and exemptions stay:
 * they are small, and they are the audit of who gave time.
 */
async function prune(now = Date.now()): Promise<{ ledger: number; notices: number }> {
  const current = mondayOf(parisDate(now));
  const cutoff = addDays(current, -7 * LEDGER_KEEP_WEEKS);
  const ledger = await db
    .delete(playtimeLedger)
    .where(lt(playtimeLedger.weekStart, cutoff))
    .returning({ id: sql`1` });
  const ended = db
    .select({ id: wardenSession.id })
    .from(wardenSession)
    .where(
      and(
        isNotNull(wardenSession.endedAt),
        lt(wardenSession.endedAt, sql`now() - interval '1 day'`),
      ),
    );
  const notices = await db
    .delete(playtimeNotice)
    .where(inArray(playtimeNotice.sessionId, ended))
    .returning({ id: sql`1` });
  return { ledger: ledger.length, notices: notices.length };
}

export const playtimePruneService = { prune };
