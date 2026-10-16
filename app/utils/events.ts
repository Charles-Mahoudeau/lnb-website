import type { EventSummary } from '#shared/schemas/events';

/** Who's registered for an event, for the "Who's going" panel. */
export interface EventAttendees {
  registered: number;
  /** Spots in total. Left out when there's no limit. */
  capacity?: number;
  /** The first few people registered, in order. */
  people: readonly { id: string; name: string }[];
}

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

/** The time of day, such as 19:30. */
export function formatEventTime(iso: string, locale: string): string {
  return formatEventDate(iso, locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/** The type's name in the page's language. */
export function eventTypeName(type: EventSummary['type'], locale: string): string {
  return locale.startsWith('fr') ? type.nameFr : type.nameEn;
}

/** Where it happens: the room, with its details after a comma. */
export function eventWhere(room: EventSummary['room']): string {
  return room.details ? `${room.name}, ${room.details}` : room.name;
}

/** Whether an event is still to come, under way, or over. */
export function eventPhase(
  event: Pick<EventSummary, 'startsAt' | 'endsAt'>,
  now = Date.now(),
): 'upcoming' | 'ongoing' | 'past' {
  if (now < new Date(event.startsAt).getTime()) return 'upcoming';
  return now < new Date(event.endsAt).getTime() ? 'ongoing' : 'past';
}

/** Calendar days from today to the event's day, in Paris time. 0 is today. */
export function daysUntil(iso: string, now = Date.now()): number {
  const day = (time: number | string) =>
    Date.parse(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(time)),
    );
  return Math.round((day(iso) - day(now)) / 86_400_000);
}

/** The schools' names, as a list in the page's language: "Epitech, e-artsup and ISEG". */
export function eventSchools(tenantIds: readonly string[], locale: string): string {
  const names = tenantIds.map((tid) => schoolForTenant(tid) ?? tid);
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(names);
}
