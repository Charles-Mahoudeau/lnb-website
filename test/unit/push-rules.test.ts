import { describe, expect, it } from 'vitest';

import { parisParts } from '../../app/utils/paris-parts.ts';
import { buildMessage, relativeOffset } from '../../server/services/push/messages.ts';
import {
  afterQuietHours,
  countOverCap,
  deviceName,
  dueReminderOffsets,
  DEFAULT_QUIET,
  inQuietHours,
  quietOf,
  nextPushAttempt,
  pushTtl,
  reminderKey,
} from '../../server/services/push/rules.ts';
import {
  pushImpactBody,
  pushPreferencesPatch,
  pushSettings,
  pushSubscribeBody,
  reminderOffsets,
} from '../../shared/schemas/push.ts';

describe('quiet hours', () => {
  it('is night in Paris from 22:00 to 08:00', () => {
    // 2026-10-19 is in summer time (UTC+2).
    expect(inQuietHours(new Date('2026-10-19T19:59:00Z'))).toBe(false); // 21:59
    expect(inQuietHours(new Date('2026-10-19T20:00:00Z'))).toBe(true); // 22:00
    expect(inQuietHours(new Date('2026-10-20T05:59:00Z'))).toBe(true); // 07:59
    expect(inQuietHours(new Date('2026-10-20T06:00:00Z'))).toBe(false); // 08:00
  });

  it('follows the winter clock too', () => {
    expect(inQuietHours(new Date('2026-12-01T20:59:00Z'))).toBe(false); // 21:59
    expect(inQuietHours(new Date('2026-12-01T21:00:00Z'))).toBe(true); // 22:00
  });

  it('holds a night notification until 08:00, and leaves a daytime one alone', () => {
    const day = new Date('2026-10-19T12:00:00Z');
    expect(afterQuietHours(day)).toBe(day);
    expect(afterQuietHours(new Date('2026-10-19T22:30:30Z')).toISOString()).toBe(
      '2026-10-20T06:00:00.000Z',
    );
    expect(afterQuietHours(new Date('2026-10-20T01:00:00Z')).toISOString()).toBe(
      '2026-10-20T06:00:00.000Z',
    );
  });

  it('holds until 08:00 across the October clock change', () => {
    // Summer time ends on Sunday 2026-10-25 at 03:00. 08:00 that morning is UTC+1.
    expect(afterQuietHours(new Date('2026-10-24T23:00:00Z')).toISOString()).toBe(
      '2026-10-25T07:00:00.000Z',
    );
  });
});

describe('configurable quiet hours', () => {
  it('can be switched off, and then nothing is held', () => {
    const off = { ...DEFAULT_QUIET, enabled: false };
    const night = new Date('2026-10-19T22:30:00Z'); // 00:30 in Paris
    expect(inQuietHours(night, off)).toBe(false);
    expect(afterQuietHours(night, off)).toBe(night);
  });

  it('holds until the configured end, over midnight or not', () => {
    // 23:00 to 09:00, over midnight: held at 00:30 until 09:00 Paris.
    const late = { enabled: true, from: 23, until: 9 };
    expect(afterQuietHours(new Date('2026-10-19T22:30:00Z'), late).toISOString()).toBe(
      '2026-10-20T07:00:00.000Z',
    );
    // 13:00 to 15:00, within one day: a lunch break.
    const lunch = { enabled: true, from: 13, until: 15 };
    expect(inQuietHours(new Date('2026-10-19T11:30:00Z'), lunch)).toBe(true); // 13:30
    expect(inQuietHours(new Date('2026-10-19T08:00:00Z'), lunch)).toBe(false); // 10:00
    expect(afterQuietHours(new Date('2026-10-19T11:30:00Z'), lunch).toISOString()).toBe(
      '2026-10-19T13:00:00.000Z',
    );
  });

  it('holds nothing when the two hours are the same', () => {
    expect(
      inQuietHours(new Date('2026-10-19T22:30:00Z'), { enabled: true, from: 8, until: 8 }),
    ).toBe(false);
  });

  it('reads the admin settings', () => {
    expect(quietOf({ quietEnabled: false, quietFrom: 1, quietUntil: 2 })).toEqual({
      enabled: false,
      from: 1,
      until: 2,
    });
  });
});

describe('reminders', () => {
  const startsAt = new Date('2026-10-24T18:00:00Z');

  it('is due once its moment has come, and not before', () => {
    expect(dueReminderOffsets(startsAt, [60], new Date('2026-10-24T16:59:00Z'))).toEqual([]);
    expect(dueReminderOffsets(startsAt, [60], new Date('2026-10-24T17:00:00Z'))).toEqual([60]);
    expect(dueReminderOffsets(startsAt, [60], new Date('2026-10-24T17:05:00Z'))).toEqual([60]);
  });

  it('is dropped when too late, such as after an outage', () => {
    expect(dueReminderOffsets(startsAt, [60], new Date('2026-10-24T17:11:00Z'))).toEqual([]);
  });

  it('picks several offsets of one event apart', () => {
    const offsets = [15, 60, 1440];
    expect(dueReminderOffsets(startsAt, offsets, new Date('2026-10-23T18:02:00Z'))).toEqual([1440]);
    expect(dueReminderOffsets(startsAt, offsets, new Date('2026-10-24T17:46:00Z'))).toEqual([15]);
  });

  it('keys a reminder by event, person, offset and start, so a moved event reminds again', () => {
    const moved = new Date('2026-10-24T19:00:00Z');
    expect(reminderKey('e', 'u', 60, startsAt)).toBe(reminderKey('e', 'u', 60, startsAt));
    expect(reminderKey('e', 'u', 60, startsAt)).not.toBe(reminderKey('e', 'u', 60, moved));
    expect(reminderKey('e', 'u', 60, startsAt)).not.toBe(reminderKey('e', 'u', 15, startsAt));
  });

  it('accepts only the presets, once each', () => {
    expect(reminderOffsets.safeParse([60, 1440]).success).toBe(true);
    expect(reminderOffsets.safeParse([]).success).toBe(true);
    expect(reminderOffsets.safeParse([45]).success).toBe(false);
    expect(reminderOffsets.safeParse([60, 60]).success).toBe(false);
  });
});

describe('when a held announcement goes out', () => {
  it('names the morning in Paris time, in each language', () => {
    const morning = afterQuietHours(new Date('2026-10-19T21:18:00Z')).toISOString();
    expect(parisParts(morning, 'en')).toEqual({ date: 'Tuesday, October 20', time: '08:00' });
    expect(parisParts(morning, 'fr')).toEqual({ date: 'mardi 20 octobre', time: '08:00' });
  });
});

describe('delivery', () => {
  const now = new Date('2026-10-19T10:00:00Z');

  it('retries after 1, 5, 30 minutes, then hourly, and gives up after six attempts', () => {
    const minutes = [1, 2, 3, 4, 5].map(
      (n) => (nextPushAttempt(n, now)!.getTime() - now.getTime()) / 60_000,
    );
    expect(minutes).toEqual([1, 5, 30, 60, 60]);
    expect(nextPushAttempt(6, now)).toBeNull();
  });

  it('keeps a reminder only until the event starts, and anything else for a day', () => {
    const startsAt = new Date('2026-10-19T10:30:00Z');
    expect(pushTtl('reminder', startsAt, now)).toBe(1800);
    expect(pushTtl('reminder', new Date('2026-10-19T10:00:10Z'), now)).toBe(60);
    expect(pushTtl('reminder', new Date('2026-10-25T10:00:00Z'), now)).toBe(86_400);
    expect(pushTtl('cancelled', null, now)).toBe(86_400);
  });

  it('names a device from its user agent', () => {
    expect(
      deviceName('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'),
    ).toBe('Chrome on Linux');
    expect(
      deviceName(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1',
      ),
    ).toBe('Safari on iOS');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe(
      'Firefox on Windows',
    );
    expect(deviceName(undefined)).toBe('Browser');
  });

  it('counts the accounts that reached the weekly limit', () => {
    expect(countOverCap([0, 2, 3, 5], 3)).toBe(2);
    expect(countOverCap([], 3)).toBe(0);
  });
});

describe('messages', () => {
  const info = {
    id: 'abc',
    name: 'Smash night',
    startsAt: new Date('2026-10-24T18:00:00Z'),
    room: 'Room 2.04',
  };

  it('writes a reminder in English', () => {
    const message = buildMessage('reminder', 'en', info, { offset: 60 });
    expect(message.title).toBe('Smash night starts in 1 hour');
    expect(message.body).toBe('Saturday 24 October at 20:00, Room 2.04.');
    expect(message.url).toBe('/events/abc');
  });

  it('writes the same in French, in Paris time', () => {
    const message = buildMessage('reminder', 'fr', info, { offset: 60 });
    expect(message.title).toBe('Smash night commence dans 1 heure');
    expect(message.body).toBe('samedi 24 octobre à 20:00, Room 2.04.');
  });

  it('writes every kind, with no placeholder left over', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const kind of ['newEvent', 'reminder', 'spot', 'cancelled', 'rescheduled'] as const) {
        const message = buildMessage(kind, locale, info);
        expect(message.title + message.body).not.toMatch(/[{}]/);
        expect(message.title).toContain(kind === 'spot' ? '' : 'Smash night');
      }
    }
  });

  it('shares one tag across an event’s reminders, changes and spots, so the latest replaces them', () => {
    expect(buildMessage('reminder', 'en', info).tag).toBe(
      buildMessage('cancelled', 'en', info).tag,
    );
    expect(buildMessage('newEvent', 'en', info).tag).not.toBe(
      buildMessage('reminder', 'en', info).tag,
    );
  });

  it('says offsets in the right unit', () => {
    expect(relativeOffset(15, 'en')).toBe('in 15 minutes');
    expect(relativeOffset(180, 'en')).toBe('in 3 hours');
    expect(relativeOffset(2880, 'fr')).toBe('dans 2 jours');
    expect(relativeOffset(10080, 'en')).toBe('in 1 week');
  });
});

describe('push schemas', () => {
  it('reads a browser subscription', () => {
    const ok = pushSubscribeBody.safeParse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'key', auth: 'secret' },
      locale: 'fr',
    });
    expect(ok.success).toBe(true);
    expect(pushSubscribeBody.safeParse({ endpoint: 'nope', keys: {}, locale: 'fr' }).success).toBe(
      false,
    );
  });

  it('lets a preference patch name any of the four switches', () => {
    expect(pushPreferencesPatch.safeParse({ reminders: false }).success).toBe(true);
    expect(pushPreferencesPatch.safeParse({ reminders: 'no' }).success).toBe(false);
  });

  it('limits the settings to what the admin page offers', () => {
    const ok = { weeklyCap: 3, silenceDays: 7, quietEnabled: true, quietFrom: 22, quietUntil: 8 };
    expect(pushSettings.safeParse(ok).success).toBe(true);
    expect(pushSettings.safeParse({ ...ok, silenceDays: null }).success).toBe(true);
    expect(pushSettings.safeParse({ ...ok, silenceDays: 14 }).success).toBe(false);
    expect(pushSettings.safeParse({ ...ok, weeklyCap: 0 }).success).toBe(false);
    expect(pushSettings.safeParse({ ...ok, quietFrom: 24 }).success).toBe(false);
  });

  it('refuses quiet hours that start and end together, unless they are off', () => {
    const base = { weeklyCap: 3, silenceDays: 30, quietFrom: 8, quietUntil: 8 };
    expect(pushSettings.safeParse({ ...base, quietEnabled: true }).success).toBe(false);
    expect(pushSettings.safeParse({ ...base, quietEnabled: false }).success).toBe(true);
  });

  it('asks for the extra detail an impact check needs', () => {
    expect(pushImpactBody.safeParse({ action: 'cancel' }).success).toBe(true);
    expect(pushImpactBody.safeParse({ action: 'capacity' }).success).toBe(false);
    expect(pushImpactBody.safeParse({ action: 'capacity', capacity: null }).success).toBe(true);
    expect(pushImpactBody.safeParse({ action: 'add', userId: 'u1' }).success).toBe(true);
  });
});
