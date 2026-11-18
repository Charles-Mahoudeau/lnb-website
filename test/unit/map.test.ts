import { describe, expect, it } from 'vitest';

import { mapSettingsBody } from '../../shared/schemas/map.ts';
import { mapCountdown, mapProgress } from '../../shared/utils/map-opening.ts';

describe('map settings body', () => {
  it('accepts an https address and trims it', () => {
    expect(mapSettingsBody.parse({ url: '  https://map.example.com/world  ' }).url).toBe(
      'https://map.example.com/world',
    );
  });

  it('turns an empty value or null into the default (null)', () => {
    expect(mapSettingsBody.parse({ url: '' }).url).toBeNull();
    expect(mapSettingsBody.parse({ url: null }).url).toBeNull();
  });

  it('refuses anything that is not an https address', () => {
    for (const url of [
      'http://map.example.com',
      'javascript:alert(1)',
      'map.example.com',
      'https://',
      'https://a b.com',
    ]) {
      expect(mapSettingsBody.safeParse({ url }).success, url).toBe(false);
    }
  });
});

describe('map opening in the settings body', () => {
  it('saves the address and the opening apart', () => {
    expect(mapSettingsBody.safeParse({ url: null }).success).toBe(true);
    expect(mapSettingsBody.safeParse({ mode: 'closed' }).success).toBe(true);
  });

  it('needs a date for the date mode', () => {
    expect(mapSettingsBody.safeParse({ mode: 'date' }).success).toBe(false);
    expect(mapSettingsBody.safeParse({ mode: 'date', opensAt: null }).success).toBe(false);
    expect(
      mapSettingsBody.safeParse({ mode: 'date', opensAt: '2026-12-03T17:00:00.000Z' }).success,
    ).toBe(true);
  });

  it('refuses an unknown mode and a bad date', () => {
    expect(mapSettingsBody.safeParse({ mode: 'later' }).success).toBe(false);
    expect(mapSettingsBody.safeParse({ mode: 'date', opensAt: 'soon' }).success).toBe(false);
  });
});

describe('map countdown', () => {
  const opens = '2026-12-03T17:00:00.000Z'; // 18:00 in Paris
  const at = (iso: string) => Date.parse(iso);

  it('counts Paris days', () => {
    expect(mapCountdown(opens, at('2026-11-18T12:00:00Z'))).toEqual({ unit: 'days', n: 15 });
    expect(mapCountdown(opens, at('2026-12-01T22:30:00Z'))).toEqual({ unit: 'days', n: 2 });
  });

  it('says tomorrow for the next Paris day, even less than 24 hours away', () => {
    expect(mapCountdown(opens, at('2026-12-02T22:30:00Z'))).toEqual({ unit: 'tomorrow' });
  });

  it('counts hours then minutes on the day itself', () => {
    expect(mapCountdown(opens, at('2026-12-03T13:29:00Z'))).toEqual({ unit: 'hours', n: 3 });
    expect(mapCountdown(opens, at('2026-12-03T16:20:00Z'))).toEqual({ unit: 'minutes', n: 40 });
  });

  it('says now once the time has come', () => {
    expect(mapCountdown(opens, at('2026-12-03T17:00:00Z'))).toEqual({ unit: 'now' });
  });
});

describe('map progress', () => {
  const opens = '2026-12-03T17:00:00.000Z';

  it('gives the day and the share of the wait', () => {
    const progress = mapProgress('2026-11-16T12:00:00Z', opens, Date.parse('2026-11-18T12:00:00Z'));
    expect(progress?.total).toBe(17);
    expect(progress?.day).toBe(3);
    expect(progress?.percent).toBe(12);
  });

  it('has nothing without a start, or a start after the opening', () => {
    expect(mapProgress(null, opens, Date.now())).toBeNull();
    expect(mapProgress('2027-01-01T00:00:00Z', opens, Date.now())).toBeNull();
  });
});
