// Event times are entered and shown in Paris time, whatever the device's time zone. Forms use
// `datetime-local` inputs, whose value is a wall-clock time with no zone ("2026-11-04T19:30"):
// these convert it to and from an instant.

const ZONE = 'Europe/Paris';

/** Paris's offset from UTC at that instant, in minutes: 60 in winter, 120 in summer. */
function offsetAt(instant: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

/** "2026-11-04T19:30" in Paris, as an ISO string in UTC. Null for an empty or bad value. */
export function parisLocalToIso(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // The offset depends on the instant, which depends on the offset: two passes settle it, also
  // around the clock changes.
  let instant = wall - offsetAt(wall) * 60_000;
  instant = wall - offsetAt(instant) * 60_000;
  return new Date(instant).toISOString();
}

/** An instant as Paris wall-clock time, for a `datetime-local` input. */
export function isoToParisLocal(iso: string): string {
  const instant = Date.parse(iso);
  const wall = new Date(instant + offsetAt(instant) * 60_000);
  return wall.toISOString().slice(0, 16);
}

// Calendar helpers for the playtime limits, which work on Paris dates ("2026-11-04") and minutes
// since Paris midnight. All of them go through the same offset logic, so they stay right on the two
// clock-change days.

const DAY_MS = 86_400_000;

/** The Paris calendar date of an instant, as "YYYY-MM-DD". */
export function parisDate(instant: number): string {
  return new Date(instant + offsetAt(instant) * 60_000).toISOString().slice(0, 10);
}

/** The instant at `minutes` after midnight, Paris time, on a Paris date. 1440 is the next midnight. */
export function parisInstant(date: string, minutes: number): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d) + minutes * 60_000;
  let instant = wall - offsetAt(wall) * 60_000;
  instant = wall - offsetAt(instant) * 60_000;
  return instant;
}

/** A date plus or minus whole days. Calendar arithmetic, so a clock change doesn't matter. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** The weekday of a date. */
export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]!;
}

/** The Monday of the week containing a Paris date. */
export function mondayOf(date: string): string {
  return addDays(date, -WEEKDAYS.indexOf(weekdayOf(date)));
}
