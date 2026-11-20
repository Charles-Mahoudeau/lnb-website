import { describe, expect, it } from 'vitest';

import {
  curveSamples,
  percentVsBase,
  ratioPosition,
  simulateOrder,
  stockStatus,
  tierBrackets,
} from '../../app/utils/market-admin.ts';
import { marketPRef } from '../../shared/utils/market.ts';
import type { MarketCurve } from '../../shared/utils/market.ts';

// The admin's client-side quote is the server's: the vectors of docs/market-mod.md 2.4.
const curve: MarketCurve = {
  p0: 0.05,
  pMin: 0.0025,
  pMax: 0.15,
  s0: 120000,
  sMin: 12000,
  sMax: 1200000,
  k: 1.3,
  alpha: 0.05,
};
const tiers = [{ tier: 1, q1: 500000, q2: 1500000, midPercent: 50, tailPercent: 10 }];
const brackets = tierBrackets(tiers, 1)!;
const base = { curve, sigma: 0.15, brackets, stock: 120000, window: 0 };

describe('the admin simulator', () => {
  it('quotes a sale and a purchase as the server does', () => {
    expect(simulateOrder({ ...base, quantity: 10000, direction: 'sell' }).total).toBe(40335);
    expect(simulateOrder({ ...base, quantity: 10000, direction: 'buy' }).total).toBe(60829);
  });

  it('shows the tail rate once the window is past the second threshold', () => {
    const sale = simulateOrder({ ...base, window: 15000, quantity: 1000, direction: 'sell' });
    expect(sale.brackets).toHaveLength(1);
    expect(sale.brackets[0]!.rate).toBe(0.1);
    expect(sale.brackets.reduce((sum, part) => sum + part.total, 0)).toBe(sale.total);
  });

  it('lowers the price after a sale and raises it after a purchase', () => {
    const now = marketPRef(curve, 120000);
    expect(simulateOrder({ ...base, quantity: 20000, direction: 'sell' }).priceAfter).toBeLessThan(
      now,
    );
    expect(
      simulateOrder({ ...base, quantity: 20000, direction: 'buy' }).priceAfter,
    ).toBeGreaterThan(now);
  });

  it('turns the settings of a tier into brackets in LNBits', () => {
    expect(brackets).toEqual({ q1: 5000, q2: 15000, mid: 0.5, tail: 0.1 });
    expect(tierBrackets(tiers, 2)).toBeUndefined();
  });
});

describe('the board and the curve', () => {
  it('puts the ratios on a log axis from 0.1x to 10x', () => {
    expect(ratioPosition(0.1)).toBeCloseTo(0);
    expect(ratioPosition(1)).toBeCloseTo(50);
    expect(ratioPosition(10)).toBeCloseTo(100);
    expect(ratioPosition(100)).toBe(100);
    expect(ratioPosition(0)).toBe(0);
  });

  it('calls an item flooded from 3x and scarce up to 0.5x', () => {
    expect(stockStatus(360, 120)).toBe('flooded');
    expect(stockStatus(60, 120)).toBe('scarce');
    expect(stockStatus(120, 120)).toBeNull();
  });

  it('compares a price to the base', () => {
    expect(percentVsBase(0.075, 0.05)).toBe(50);
    expect(percentVsBase(0.025, 0.05)).toBe(-50);
  });

  it('samples the curve from sMin and never above pMax', () => {
    const points = curveSamples(curve, 360000, 10);
    expect(points).toHaveLength(11);
    expect(points[0]!.stock).toBe(curve.sMin);
    expect(Math.max(...points.map((p) => p.price))).toBeLessThanOrEqual(curve.pMax);
    expect(points.at(-1)!.price).toBeCloseTo(marketPRef(curve, 360000), 9);
  });
});
