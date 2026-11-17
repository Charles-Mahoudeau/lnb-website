import { describe, expect, it } from 'vitest';

import {
  addDays,
  isoToParisLocal,
  mondayOf,
  parisDate,
  parisInstant,
  parisLocalToIso,
  weekdayOf,
} from '../../shared/utils/paris-time.ts';

describe('Paris time', () => {
  it('converts winter and summer times', () => {
    expect(parisLocalToIso('2026-11-04T19:30')).toBe('2026-11-04T18:30:00.000Z');
    expect(parisLocalToIso('2026-07-14T22:00')).toBe('2026-07-14T20:00:00.000Z');
  });

  it('goes back to the same wall-clock time', () => {
    for (const local of [
      '2026-11-04T19:30',
      '2026-07-14T22:00',
      '2026-03-29T03:30',
      '2026-10-25T01:15',
    ]) {
      expect(isoToParisLocal(parisLocalToIso(local)!)).toBe(local);
    }
  });

  it('refuses empty or malformed values', () => {
    expect(parisLocalToIso('')).toBeNull();
    expect(parisLocalToIso('2026-11-04 19:30')).toBeNull();
  });
});

describe('Paris dates', () => {
  it('gives the Paris date of an instant, also near midnight', () => {
    expect(parisDate(Date.parse('2026-11-16T22:59:59Z'))).toBe('2026-11-16');
    expect(parisDate(Date.parse('2026-11-16T23:00:00Z'))).toBe('2026-11-17');
    expect(parisDate(Date.parse('2026-07-14T21:59:59Z'))).toBe('2026-07-14');
    expect(parisDate(Date.parse('2026-07-14T22:00:00Z'))).toBe('2026-07-15');
  });

  it('turns a date and minutes into an instant, with 1440 as the next midnight', () => {
    expect(new Date(parisInstant('2026-11-16', 9 * 60)).toISOString()).toBe(
      '2026-11-16T08:00:00.000Z',
    );
    expect(parisInstant('2026-11-16', 1440)).toBe(parisInstant('2026-11-17', 0));
    // A day with a clock change is 23 or 25 hours long.
    expect((parisInstant('2027-03-29', 0) - parisInstant('2027-03-28', 0)) / 3_600_000).toBe(23);
    expect((parisInstant('2027-11-01', 0) - parisInstant('2027-10-31', 0)) / 3_600_000).toBe(25);
  });

  it('does calendar arithmetic and finds weekdays and Mondays', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf('2026-11-16')).toBe('mon');
    expect(weekdayOf('2026-11-22')).toBe('sun');
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
  });
});
