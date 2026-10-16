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

// Registration

/** Whether someone can register now, and if not, why. Checked in this order. */
export type RegistrationState =
  'cancelled' | 'started' | 'notYet' | 'closed' | 'wrongSchool' | 'full' | 'open';

export interface RegistrationEvent {
  startsAt: Date;
  cancelledAt: Date | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  schools: readonly string[];
  capacity: number | null;
  registered: number;
}

/**
 * Where registration stands for an event. `tenantId` is the visitor's school, or null when
 * signed out, which skips the school check. `full` still lets people join the waitlist.
 */
export function registrationState(
  event: RegistrationEvent,
  tenantId: string | null,
  now = new Date(),
): RegistrationState {
  if (event.cancelledAt) return 'cancelled';
  if (now >= event.startsAt) return 'started';
  if (event.registrationOpensAt && now < event.registrationOpensAt) return 'notYet';
  if (event.registrationClosesAt && now >= event.registrationClosesAt) return 'closed';
  if (tenantId !== null && !event.schools.includes(tenantId.toLowerCase())) return 'wrongSchool';
  if (event.capacity !== null && event.registered >= event.capacity) return 'full';
  return 'open';
}

/**
 * How many people on the waitlist get a place: as many as there are free places, or all of them
 * once there's no limit. None after the start: the list is frozen once the event begins.
 */
export function placesToPromote(
  event: { startsAt: Date; capacity: number | null; registered: number; waitlist: number },
  now = new Date(),
): number {
  if (now >= event.startsAt || event.waitlist === 0) return 0;
  if (event.capacity === null) return event.waitlist;
  return Math.max(0, Math.min(event.capacity - event.registered, event.waitlist));
}

// Images

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The largest region of a `width` × `height` image with the given aspect ratio, centered on the
 * focal point (0 to 1 from the top left) as far as the edges allow.
 */
export function focalCrop(
  width: number,
  height: number,
  aspect: number,
  focusX: number,
  focusY: number,
): CropRect {
  const cropWidth = Math.min(width, Math.round(height * aspect));
  const cropHeight = Math.min(height, Math.round(cropWidth / aspect));
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
  return {
    left: clamp(Math.round(focusX * width - cropWidth / 2), width - cropWidth),
    top: clamp(Math.round(focusY * height - cropHeight / 2), height - cropHeight),
    width: cropWidth,
    height: cropHeight,
  };
}

/**
 * Whether an IP address is one the server must never fetch from a pasted link: loopback,
 * private, link-local, carrier-grade NAT, unspecified, multicast or reserved, in IPv4 or IPv6.
 */
export function isPrivateAddress(address: string): boolean {
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/i.exec(address);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe8') ||
    v6.startsWith('fe9') ||
    v6.startsWith('fea') ||
    v6.startsWith('feb') ||
    v6.startsWith('ff') ||
    v6.startsWith('64:ff9b:') ||
    v6.startsWith('2001:db8')
  );
}

// The BDE website (docs/bde/external_events_api.md)

/** What the BDE website takes for an event: every field, every time, since PUT replaces it. */
export interface BdePayload {
  name: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  url: string;
  images: string[];
  paid: boolean;
  price: number | null;
  hidden: boolean;
}

export function toBdePayload(input: {
  name: string;
  descriptionText: string;
  room: { name: string; details: string | null };
  startsAt: Date;
  endsAt: Date;
  hidden: boolean;
  price: number | null;
  /** Absolute URLs. */
  pageUrl: string;
  embedUrl: string | null;
}): BdePayload {
  const paid = input.price !== null && input.price > 0;
  return {
    name: input.name,
    description: input.descriptionText,
    location: input.room.details ? `${input.room.name}, ${input.room.details}` : input.room.name,
    starts_at: input.startsAt.toISOString(),
    ends_at: input.endsAt.toISOString(),
    url: input.pageUrl,
    images: input.embedUrl ? [input.embedUrl] : [],
    paid,
    price: paid ? input.price : null,
    hidden: input.hidden,
  };
}

/**
 * The BDE website's own checks, made before sending so a payload bound to fail isn't sent. In
 * its error format: field name, then messages. Empty when it passes.
 */
/** Characters as people count them (graphemes), as the BDE website's Elixir code counts them. */
function graphemes(text: string): number {
  return [...new Intl.Segmenter().segment(text)].length;
}

export function bdeProblems(payload: BdePayload): Record<string, string[]> {
  const problems: Record<string, string[]> = {};
  const add = (field: string, message: string) => (problems[field] ??= []).push(message);
  const length = graphemes(payload.name);
  if (length < 3 || length > 100) add('name', 'should be 3 to 100 characters');
  if (graphemes(payload.description) < 10) add('description', 'should be at least 10 characters');
  if (graphemes(payload.location) < 3) add('location', 'should be at least 3 characters');
  if (Date.parse(payload.ends_at) <= Date.parse(payload.starts_at)) {
    add('ends_at', 'must be after the start date');
  }
  return problems;
}

/** Waits after the 1st, 2nd and 3rd failure, then every hour. */
const RETRY_MINUTES = [1, 5, 30];

/** When to try again after `attempts` failures in a row. */
export function nextBdeAttempt(attempts: number, now = new Date()): Date {
  const minutes = RETRY_MINUTES[attempts - 1] ?? 60;
  return new Date(now.getTime() + minutes * 60_000);
}
