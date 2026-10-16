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
