import { describe, expect, it } from 'vitest';

import {
  formatMarketDelta,
  marketMeter,
  marketMood,
  marketMovers,
} from '../../app/utils/market.ts';

const item = (id: string, deltaPercent: number, sellable = true, buyable = true) =>
  ({ id, deltaPercent, sellable, buyable }) as Parameters<typeof marketMovers>[0][number];

describe('market movers', () => {
  it('lists the sellable items furthest above base and the buyable ones furthest below', () => {
    const items = [
      item('a', 40),
      item('b', -50),
      item('c', 10, true, false),
      item('d', 90, false, true),
      item('e', -10),
    ];
    const { paying, cheapest } = marketMovers(items, 2);
    expect(paying.map((i) => i.id)).toEqual(['a', 'c']);
    expect(cheapest.map((i) => i.id)).toEqual(['b', 'e']);
  });

  it('gives empty lists when nothing is sellable or buyable', () => {
    expect(marketMovers([item('a', 1, false, false)])).toEqual({ paying: [], cheapest: [] });
  });
});

describe('market delta and meter', () => {
  it('formats a delta with a real minus sign and one decimal under 10 points', () => {
    expect(formatMarketDelta(12.34, 'en')).toBe('+12%');
    expect(formatMarketDelta(-8.26, 'en')).toBe('−8.3%');
    expect(formatMarketDelta(0, 'en')).toBe('0%');
    expect(formatMarketDelta(0.02, 'en')).toBe('0%');
    expect(formatMarketDelta(-8.26, 'fr')).toBe('−8,3%');
  });

  it('fills the meter against the second threshold and puts the tick on the first', () => {
    expect(marketMeter(2500, 5000, 15000)).toEqual({
      fill: (2500 / 15000) * 100,
      tick: (1 / 3) * 100,
    });
    expect(marketMeter(99999, 5000, 15000).fill).toBe(100);
    expect(marketMeter(0, 0, 0)).toEqual({ fill: 0, tick: 0 });
  });

  it('calls an item plentiful or scarce only far from its base price', () => {
    expect(marketMood(-45)).toBe('plentiful');
    expect(marketMood(80)).toBe('scarce');
    expect(marketMood(10)).toBeNull();
  });
});
