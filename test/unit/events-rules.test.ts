import { describe, expect, it } from 'vitest';

import { buildIcs, shiftDate } from '../../server/services/events/rules.ts';
import {
  eventBody,
  eventRoomBody,
  eventRoomPatchBody,
  eventTypeBody,
} from '../../shared/schemas/events.ts';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';

function body(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Werewolf night',
    description: 'Werewolf and Among Us at the foyer.',
    roomId: '0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
    typeId: '1b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
    schools: [EPITECH],
    startsAt: '2026-11-20T19:00:00+01:00',
    endsAt: '2026-11-20T23:30:00+01:00',
    capacity: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    price: null,
    hidden: false,
    bdeSync: false,
    ...overrides,
  };
}

/** The custom messages of a failed parse, such as `endsBeforeStart`. */
function problems(input: unknown): string[] {
  const result = eventBody.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('event body', () => {
  it('accepts a complete event', () => {
    expect(eventBody.safeParse(body()).success).toBe(true);
  });

  it('needs the end after the start', () => {
    expect(problems(body({ endsAt: '2026-11-20T19:00:00+01:00' }))).toEqual(['endsBeforeStart']);
    // Offsets count: 18:30Z is 19:30 in Paris, after the start.
    expect(problems(body({ endsAt: '2026-11-20T18:30:00Z' }))).toEqual([]);
  });

  it('keeps the registration window before the start, and in order', () => {
    expect(problems(body({ registrationClosesAt: '2026-11-20T20:00:00+01:00' }))).toEqual([
      'closesAfterStart',
    ]);
    expect(
      problems(
        body({
          registrationOpensAt: '2026-11-10T12:00:00+01:00',
          registrationClosesAt: '2026-11-09T12:00:00+01:00',
        }),
      ),
    ).toEqual(['opensAfterClose']);
  });

  it("applies the BDE website's rules only when the event is pushed there", () => {
    const short = { name: 'LAN', description: 'Bring a PC' };
    expect(problems(body({ ...short, name: 'Go' }))).toEqual([]);
    expect(problems(body({ ...short, name: 'Go', description: 'Short', bdeSync: true }))).toEqual([
      'bdeName',
      'bdeDescription',
    ]);
    expect(problems(body({ name: 'x'.repeat(101), bdeSync: true }))).toEqual(['bdeName']);
  });

  it('refuses unknown or repeated schools, and no school at all', () => {
    expect(eventBody.safeParse(body({ schools: [] })).success).toBe(false);
    expect(eventBody.safeParse(body({ schools: [EPITECH, EPITECH] })).success).toBe(false);
    expect(eventBody.safeParse(body({ schools: ['not-a-tenant'] })).success).toBe(false);
  });

  it('needs dates with an offset', () => {
    expect(eventBody.safeParse(body({ startsAt: '2026-11-20T19:00:00' })).success).toBe(false);
  });
});

describe('rooms and types', () => {
  it('stores an empty room detail as null', () => {
    expect(eventRoomBody.parse({ name: ' Foyer ', details: '  ' })).toEqual({
      name: 'Foyer',
      details: null,
    });
  });

  it('refuses an empty patch', () => {
    expect(eventRoomPatchBody.safeParse({}).success).toBe(false);
    expect(eventRoomPatchBody.safeParse({ archived: true }).success).toBe(true);
  });

  it('takes Lucide icons only', () => {
    const type = { nameEn: 'Tournament', nameFr: 'Tournoi' };
    expect(eventTypeBody.safeParse({ ...type, icon: 'i-lucide-swords' }).success).toBe(true);
    expect(eventTypeBody.safeParse({ ...type, icon: 'i-simple-icons-discord' }).success).toBe(
      false,
    );
  });
});

describe('duplicating', () => {
  it('moves a date by as much as the start moved', () => {
    const from = new Date('2026-11-20T18:00:00Z');
    const to = new Date('2026-11-27T18:00:00Z');
    expect(shiftDate(new Date('2026-11-13T11:00:00Z'), from, to)).toEqual(
      new Date('2026-11-20T11:00:00Z'),
    );
    expect(shiftDate(null, from, to)).toBeNull();
  });
});

describe('calendar file', () => {
  const event = {
    id: '0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
    name: 'Werewolf, Among Us; and more',
    description: 'Two rounds.\n- 19:30 doors',
    location: 'Wakanda, Campus Nantes',
    startsAt: new Date('2026-11-04T18:30:00Z'),
    endsAt: new Date('2026-11-04T22:30:00Z'),
    url: 'https://lnb.bde-teknantes.fr/events/0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
    cancelled: false,
    updatedAt: new Date('2026-10-16T09:00:00Z'),
  };

  it('writes the event in UTC with escaped text and CRLF lines', () => {
    const ics = buildIcs(event, new Date('2026-10-16T10:00:00Z'));
    expect(ics).toContain('DTSTART:20261104T183000Z\r\n');
    expect(ics).toContain('DTEND:20261104T223000Z\r\n');
    expect(ics).toContain('SUMMARY:Werewolf\\, Among Us\\; and more\r\n');
    expect(ics).toContain('UID:0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b@lnb');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('folds long lines at 75 octets', () => {
    const ics = buildIcs({ ...event, description: 'é'.repeat(200) });
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('marks a cancelled event', () => {
    expect(buildIcs({ ...event, cancelled: true })).toContain('STATUS:CANCELLED');
  });
});
