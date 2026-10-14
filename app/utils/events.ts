export interface UpcomingEvent {
  /** Key of the event's title and room under `events.` in the locale files. */
  key: string;
  startsAt: string;
  /** Banner art URL. Events without one show plain night navy. */
  banner?: string;
}

/** Placeholder events, shown until the events service exists. */
export const UPCOMING_EVENTS: readonly UpcomingEvent[] = [
  { key: 'werewolf', startsAt: '2026-11-04T19:30:00+01:00' },
  { key: 'minecraft', startsAt: '2026-11-18T19:30:00+01:00' },
];

/** Formats an event date in Paris time, whatever the server's time zone. */
export function formatEventDate(
  iso: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Paris', ...options }).format(
    new Date(iso),
  );
}
