import { describe, expect, it } from 'vitest';

import { formatDealEnd, formatEuros } from '../../app/utils/gamesplanet.ts';

describe('formatEuros', () => {
  it('formats cents as euros in the active language', () => {
    expect(formatEuros(599, 'en')).toBe('€5.99');
    expect(formatEuros(599, 'fr').replace(/\s/g, ' ')).toBe('5,99 €');
  });
});

describe('formatDealEnd', () => {
  it('uses the Paris day, not the UTC one', () => {
    expect(formatDealEnd('2026-11-17T23:30:00Z', 'en')).toBe('Nov 18');
  });
});
