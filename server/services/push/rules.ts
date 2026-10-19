// Push rules with no database and no Nuxt imports, so unit tests can load them.

const ZONE = 'Europe/Paris';

export interface QuietHours {
  enabled: boolean;
  /** Whole hours in Paris time. From later than until means it runs over midnight. */
  from: number;
  until: number;
}

/** What an admin sees until they change it: new-event notifications wait from 22:00 to 08:00. */
export const DEFAULT_QUIET: QuietHours = { enabled: true, from: 22, until: 8 };

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;

/** The quiet hours of the admin settings. */
export function quietOf(settings: {
  quietEnabled: boolean;
  quietFrom: number;
  quietUntil: number;
}): QuietHours {
  return { enabled: settings.quietEnabled, from: settings.quietFrom, until: settings.quietUntil };
}

function parisHour(date: Date): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hourCycle: 'h23',
    hour: '2-digit',
  }).format(date);
  return Number(hour);
}

export function inQuietHours(date: Date, quiet: QuietHours = DEFAULT_QUIET): boolean {
  if (!quiet.enabled || quiet.from === quiet.until) return false;
  const hour = parisHour(date);
  return quiet.from < quiet.until
    ? hour >= quiet.from && hour < quiet.until
    : hour >= quiet.from || hour < quiet.until;
}

/**
 * When a quiet-hours notification may go out: now by day, when the quiet period ends at night.
 * Steps by the minute so clock changes can't skew it.
 */
export function afterQuietHours(date: Date, quiet: QuietHours = DEFAULT_QUIET): Date {
  if (!inQuietHours(date, quiet)) return date;
  let at = new Date(Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS);
  while (inQuietHours(at, quiet)) at = new Date(at.getTime() + MINUTE_MS);
  return at;
}

/** How late a reminder may still go out, such as after a short outage of the scheduler. */
export const REMINDER_GRACE_MS = 10 * MINUTE_MS;

/**
 * The reminders of an event that are due: their moment has come, and not so long ago that
 * they'd be stale. Offsets are minutes before the start.
 */
export function dueReminderOffsets(
  startsAt: Date,
  offsets: readonly number[],
  now: Date,
): number[] {
  return offsets.filter((minutes) => {
    const at = startsAt.getTime() - minutes * MINUTE_MS;
    return at <= now.getTime() && now.getTime() - at <= REMINDER_GRACE_MS;
  });
}

/** One key per reminder, user and start time, so a moved event reminds again. */
export function reminderKey(
  eventId: string,
  userId: string,
  offset: number,
  startsAt: Date,
): string {
  return ['reminder', eventId, userId, String(offset), String(startsAt.getTime())].join(':');
}

/** Retries after a failed send: 1, 5, 30 minutes, then hourly. Null after the sixth attempt. */
export function nextPushAttempt(attempts: number, now: Date): Date | null {
  if (attempts >= 6) return null;
  const minutes = [1, 5, 30, 60, 60][attempts - 1] ?? 60;
  return new Date(now.getTime() + minutes * MINUTE_MS);
}

/** How long the push service keeps a notification for an offline device, in seconds. */
export function pushTtl(kind: string, startsAt: Date | null, now: Date): number {
  const day = 24 * 60 * 60;
  if (kind === 'reminder' && startsAt) {
    return Math.max(60, Math.min(day, Math.floor((startsAt.getTime() - now.getTime()) / 1000)));
  }
  return day;
}

/** "Chrome on Linux" from a user agent. Rough on purpose: it only names a device in a list. */
export function deviceName(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /(Chrome|CriOS)\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /(iPhone|iPad|iPod)/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /(Macintosh|Mac OS X)/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}

/** How many of these accounts already received at least the weekly limit. */
export function countOverCap(received: Iterable<number>, cap: number): number {
  let over = 0;
  for (const n of received) if (n >= cap) over++;
  return over;
}
