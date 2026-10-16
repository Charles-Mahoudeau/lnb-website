import { describe, expect, it } from 'vitest';

import { isoToParisLocal, parisLocalToIso } from '../../shared/utils/paris-time.ts';

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
