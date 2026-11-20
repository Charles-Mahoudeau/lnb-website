import { and, count, desc, eq, gt, gte, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  event,
  eventRegistration,
  questCompletion,
  questIndexDay,
  user,
  wardenAppeal,
  wardenBan,
} from '~~/server/db/schema';
import { circulation } from '~~/server/services/quests/shared';

import type { AdminWeek, AdminWeekId } from '#shared/schemas/admin';
import { isAdmin, isEconomyAdmin, isEventsManager, isWardenAdmin } from '#shared/utils/roles';

// The strip at the top of the admin Home: a few plain figures, from rows the site already keeps
// (no usage tracking). Each role gets its own, in order; a person with several roles gets the
// union without repeats.

const DAY = 24 * 3600 * 1000;
const one = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0;

const FIGURES: Record<AdminWeekId, (now: Date) => Promise<number>> = {
  signups: (now) =>
    one(
      db
        .select({ n: count() })
        .from(user)
        .where(and(eq(user.ghost, false), gte(user.createdAt, new Date(+now - 7 * DAY)))),
    ),
  eventsUpcoming: (now) =>
    one(
      db
        .select({ n: count() })
        .from(event)
        .where(and(gt(event.endsAt, now), isNull(event.cancelledAt))),
    ),
  bans: (now) =>
    one(
      db
        .select({ n: count() })
        .from(wardenBan)
        .where(gte(wardenBan.createdAt, new Date(+now - 7 * DAY))),
    ),
  appealsAnswered: (now) =>
    one(
      db
        .select({ n: count() })
        .from(wardenAppeal)
        .where(gte(wardenAppeal.decidedAt, new Date(+now - 7 * DAY))),
    ),
  registrations: (now) =>
    one(
      db
        .select({ n: count() })
        .from(eventRegistration)
        .where(
          and(
            eq(eventRegistration.status, 'registered'),
            gte(eventRegistration.createdAt, new Date(+now - 7 * DAY)),
          ),
        ),
    ),
  circulation: () => circulation(db),
  questsCompleted: (now) =>
    one(
      db
        .select({ n: count() })
        .from(questCompletion)
        .where(gte(questCompletion.completedAt, new Date(+now - 7 * DAY))),
    ),
  rewardIndex: async () => {
    const [row] = await db
      .select({ index: questIndexDay.index })
      .from(questIndexDay)
      .orderBy(desc(questIndexDay.day))
      .limit(1);
    return Math.round(row?.index ?? 0);
  },
};

function idsFor(role: string | null | undefined): AdminWeekId[] {
  // Site admins hold every other role too, and get their own four.
  if (isAdmin(role)) return ['signups', 'eventsUpcoming', 'bans', 'registrations'];
  const ids: AdminWeekId[] = [];
  if (isWardenAdmin(role)) ids.push('bans', 'appealsAnswered');
  if (isEventsManager(role)) ids.push('registrations', 'eventsUpcoming');
  if (isEconomyAdmin(role)) ids.push('circulation', 'questsCompleted', 'rewardIndex');
  return [...new Set(ids)];
}

async function week(role: string | null | undefined, now = new Date()): Promise<AdminWeek> {
  const ids = idsFor(role);
  const values = await Promise.all(ids.map((id) => FIGURES[id](now)));
  return { stats: ids.map((id, i) => ({ id, value: values[i]! })) };
}

export const adminWeekService = { week };
