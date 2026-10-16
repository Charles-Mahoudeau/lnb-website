// Event rules with no database and no Nuxt imports, so unit tests can load them.

/** A date moved by the same amount as an event's start, or null for null. */
export function shiftDate(date: Date | null, from: Date, to: Date): Date | null {
  return date ? new Date(date.getTime() + (to.getTime() - from.getTime())) : null;
}

// iCalendar (RFC 5545), for "Add to calendar".

/** Escapes a TEXT value: backslashes, semicolons, commas and line breaks. */
function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** 20261104T183000Z */
function icsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Folds a line at 75 octets, continuing on lines that start with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const charSize = new TextEncoder().encode(char).length;
    if (size + charSize > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += charSize;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export interface IcsEvent {
  id: string;
  name: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  url: string;
  cancelled: boolean;
  updatedAt: Date;
}

/** One event as an .ics file. Its UID stays the same, so importing it again updates the entry. */
export function buildIcs(event: IcsEvent, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LNB//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@lnb`,
    `DTSTAMP:${icsDate(now)}`,
    `LAST-MODIFIED:${icsDate(event.updatedAt)}`,
    `DTSTART:${icsDate(event.startsAt)}`,
    `DTEND:${icsDate(event.endsAt)}`,
    `SUMMARY:${icsText(event.name)}`,
    `LOCATION:${icsText(event.location)}`,
    `DESCRIPTION:${icsText(`${event.description}\n\n${event.url}`)}`,
    `URL:${event.url}`,
    `STATUS:${event.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
