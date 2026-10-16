import { describe, expect, it } from 'vitest';

import {
  bdeProblems,
  buildIcs,
  focalCrop,
  isPrivateAddress,
  nextBdeAttempt,
  placesToPromote,
  registrationState,
  shiftDate,
  toBdePayload,
} from '../../server/services/events/rules.ts';
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

describe('registration', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  const EPITECH_ID = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
  const open = {
    startsAt: new Date('2026-11-04T18:30:00Z'),
    cancelledAt: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    schools: [EPITECH_ID],
    capacity: 40,
    registered: 10,
  };

  it('is open by default, from publication until the start', () => {
    expect(registrationState(open, EPITECH_ID, now)).toBe('open');
    expect(registrationState(open, null, now)).toBe('open');
    expect(registrationState(open, EPITECH_ID, new Date('2026-11-04T18:30:00Z'))).toBe('started');
  });

  it('follows the registration window', () => {
    const later = { ...open, registrationOpensAt: new Date('2026-11-02T11:00:00Z') };
    expect(registrationState(later, EPITECH_ID, now)).toBe('notYet');
    const early = { ...open, registrationClosesAt: new Date('2026-11-01T12:00:00Z') };
    expect(registrationState(early, EPITECH_ID, now)).toBe('closed');
  });

  it('checks the school only when someone is signed in, after the window', () => {
    const iseg = '8dab9574-4b8e-4eec-8e5e-791d6835fdea';
    expect(registrationState(open, iseg, now)).toBe('wrongSchool');
    expect(registrationState(open, EPITECH_ID.toUpperCase(), now)).toBe('open');
  });

  it('turns full at the limit, and cancelled wins over everything', () => {
    expect(registrationState({ ...open, registered: 40 }, EPITECH_ID, now)).toBe('full');
    expect(registrationState({ ...open, capacity: null, registered: 500 }, EPITECH_ID, now)).toBe(
      'open',
    );
    expect(registrationState({ ...open, cancelledAt: now }, EPITECH_ID, now)).toBe('cancelled');
  });

  it('promotes as many people as there are free places, until the start', () => {
    const event = { startsAt: open.startsAt, capacity: 10, registered: 8, waitlist: 5 };
    expect(placesToPromote(event, now)).toBe(2);
    expect(placesToPromote({ ...event, registered: 12 }, now)).toBe(0);
    expect(placesToPromote({ ...event, capacity: null }, now)).toBe(5);
    expect(placesToPromote(event, open.startsAt)).toBe(0);
  });
});

describe('images', () => {
  it('crops around the focal point, within the image', () => {
    // A 3840 × 2160 image to a 1920 × 620 banner: full width, a band 1240 high.
    expect(focalCrop(3840, 2160, 1920 / 620, 0.5, 0.5)).toEqual({
      left: 0,
      top: 460,
      width: 3840,
      height: 1240,
    });
    expect(focalCrop(3840, 2160, 1920 / 620, 0.5, 0)).toMatchObject({ top: 0 });
    expect(focalCrop(3840, 2160, 1920 / 620, 0.5, 1)).toMatchObject({ top: 920 });
    // A banner-shaped image to 16:9: full height, the width around the focus.
    expect(focalCrop(1920, 620, 16 / 9, 0.9, 0.5)).toEqual({
      left: 818,
      top: 0,
      width: 1102,
      height: 620,
    });
  });

  it('refuses private, loopback and link-local addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
    for (const address of ['104.21.32.1', '2606:4700::6810:84e5', '172.32.0.1']) {
      expect(isPrivateAddress(address)).toBe(false);
    }
  });
});

describe('BDE website', () => {
  const event = {
    name: 'Werewolf night',
    descriptionText: 'Two rounds of Werewolf, then Among Us.',
    room: { name: 'Wakanda', details: 'Campus Nantes' },
    startsAt: new Date('2026-11-04T18:30:00Z'),
    endsAt: new Date('2026-11-04T22:30:00Z'),
    hidden: false,
    price: null,
    pageUrl: 'https://lnb.bde-teknantes.fr/events/0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
    embedUrl: 'https://lnb.bde-teknantes.fr/api/media/abc.jpg',
  };

  it('maps an event to the BDE fields', () => {
    expect(toBdePayload(event)).toEqual({
      name: 'Werewolf night',
      description: 'Two rounds of Werewolf, then Among Us.',
      location: 'Wakanda, Campus Nantes',
      starts_at: '2026-11-04T18:30:00.000Z',
      ends_at: '2026-11-04T22:30:00.000Z',
      url: event.pageUrl,
      images: [event.embedUrl],
      paid: false,
      price: null,
      hidden: false,
    });
    expect(toBdePayload({ ...event, price: 2, embedUrl: null })).toMatchObject({
      paid: true,
      price: 2,
      images: [],
    });
    expect(toBdePayload({ ...event, price: 0 })).toMatchObject({ paid: false, price: null });
  });

  it('checks the fields as the BDE website does', () => {
    expect(bdeProblems(toBdePayload(event))).toEqual({});
    expect(
      bdeProblems(
        toBdePayload({
          ...event,
          name: 'Go',
          descriptionText: 'Short',
          room: { name: 'B', details: null },
        }),
      ),
    ).toEqual({
      name: ['should be 3 to 100 characters'],
      description: ['should be at least 10 characters'],
      location: ['should be at least 3 characters'],
    });
  });

  it('retries after 1, 5 and 30 minutes, then every hour', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    const minutes = (attempts: number) =>
      (nextBdeAttempt(attempts, now).getTime() - now.getTime()) / 60_000;
    expect([1, 2, 3, 4, 9].map(minutes)).toEqual([1, 5, 30, 60, 60]);
  });
});
