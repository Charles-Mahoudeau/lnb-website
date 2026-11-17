import { describe, expect, it } from 'vitest';

import {
  formatPlaytimeMinutes,
  parsePlaytimeMinutes,
  playtimeMonthCells,
} from '../../shared/utils/playtime-admin.ts';

describe('parsePlaytimeMinutes', () => {
  it('reads commas and spaces, largest first, without doubles', () => {
    expect(parsePlaytimeMinutes('1, 30 10;5,5')).toEqual([30, 10, 5, 1]);
  });
  it('accepts an empty list, which switches warnings off', () => {
    expect(parsePlaytimeMinutes('')).toEqual([]);
  });
  it('refuses words, zero, decimals, too large values and more than ten', () => {
    expect(parsePlaytimeMinutes('10, soon')).toBeNull();
    expect(parsePlaytimeMinutes('0')).toBeNull();
    expect(parsePlaytimeMinutes('2.5')).toBeNull();
    expect(parsePlaytimeMinutes('601')).toBeNull();
    expect(parsePlaytimeMinutes('1 2 3 4 5 6 7 8 9 10 11')).toBeNull();
  });
  it('formats the way it parses', () => {
    expect(formatPlaytimeMinutes([30, 10, 5, 1])).toBe('30, 10, 5, 1');
  });
});

describe('playtimeMonthCells', () => {
  it('pads to the Monday before the 1st', () => {
    // 1 November 2026 is a Sunday: six blanks, then 30 days.
    const cells = playtimeMonthCells(2026, 10);
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(cells[6]).toBe('2026-11-01');
    expect(cells.at(-1)).toBe('2026-11-30');
    expect(cells).toHaveLength(36);
  });
  it('has no blanks when the month starts on a Monday', () => {
    // 1 February 2027 is a Monday, in a 28-day month.
    const cells = playtimeMonthCells(2027, 1);
    expect(cells[0]).toBe('2027-02-01');
    expect(cells).toHaveLength(28);
  });
});
