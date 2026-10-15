// Dates and lengths for the Warden pages, from Intl in Europe/Paris, as docs/design.md asks.

const TIME_ZONE = 'Europe/Paris';

/** "Thursday 22 October at 16:06" (or the locale's equivalent). */
export function formatWardenDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** "15 October 2026". */
export function formatWardenDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/** "3 hours ago", "yesterday". */
export function formatWardenRelative(iso: string, locale: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86400],
    ['month', 30 * 86400],
    ['week', 7 * 86400],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.trunc(seconds / size), unit);
  }
  return rtf.format(0, 'minute');
}

/** "41 h 12 min": hours and minutes, for playtime and session lengths. */
export function formatWardenDuration(totalSeconds: number, locale: string): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const unit = (value: number, name: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' }).format(
      value,
    );
  if (hours === 0) return unit(minutes, 'minute');
  return `${unit(hours, 'hour')} ${unit(minutes, 'minute')}`;
}

/** A ban's length, in whole days when it's a number of days ("7 days"), else in hours. */
export function formatWardenBanLength(
  createdAt: string,
  expiresAt: string,
  locale: string,
): string {
  const hours = Math.max(1, Math.round((Date.parse(expiresAt) - Date.parse(createdAt)) / 3600_000));
  const [value, unit] = hours % 24 === 0 ? [hours / 24, 'day'] : [hours, 'hour'];
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(value);
}
