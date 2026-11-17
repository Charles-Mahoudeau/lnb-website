import { describe, expect, it } from 'vitest';

import {
  applyCap,
  computeIndex,
  drawDaily,
  endOfParisDay,
  familyBudget,
  kGlobal,
  kPlayer,
  parisDay,
  previousDay,
  quantile,
  reward,
  withinHours,
} from '../../server/services/quests/formula.ts';
import { questSettings } from '../../shared/schemas/quests.ts';

const settings = questSettings.parse({});
const formula = settings.formula;

describe('quest reward formula', () => {
  it('interpolates quantiles like the spec', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.75)).toBe(10);
    expect(quantile([], 0.5)).toBe(0);
  });

  it('falls back to the reference index with too few players', () => {
    const result = computeIndex([100, 200, 300], formula, 5);
    expect(result.fallback).toBe(true);
    expect(result.index).toBe(1000);
    expect(result.kGlobal).toBe(1);
  });

  it('mixes the median and Q3 75/25 by default', () => {
    const result = computeIndex([1000, 1000, 2000, 3000, 5000], formula, 5);
    expect(result.median).toBe(2000);
    expect(result.q3).toBe(3000);
    expect(result.index).toBe(2250);
    expect(result.fallback).toBe(false);
  });

  it('ignores a whale with the default weights', () => {
    const calm = computeIndex([1000, 1200, 1400, 1600, 1800, 2000], formula, 5);
    const whale = computeIndex([1000, 1200, 1400, 1600, 1800, 10_000_000], formula, 5);
    expect(whale.index).toBeCloseTo(calm.index, -2);
  });

  it('damps the global multiplier and clamps it', () => {
    expect(kGlobal(2000, formula)).toBeCloseTo(1.189, 3);
    expect(kGlobal(10_000, formula)).toBeCloseTo(1.778, 3);
    expect(kGlobal(1_000_000, formula)).toBe(2);
    expect(kGlobal(10, formula)).toBe(0.8);
  });

  it('gives up to +50 % to the poorest players only', () => {
    expect(kPlayer(0, 2000, formula)).toBe(1.5);
    expect(kPlayer(1000, 2000, formula)).toBe(1.25);
    expect(kPlayer(2000, 2000, formula)).toBe(1);
    expect(kPlayer(9000, 2000, formula)).toBe(1);
  });

  it('rounds rewards to whole LNBits', () => {
    expect(reward(50, 1.189, 1.25)).toBe(74);
  });

  it('splits the cap between families and cuts what is over', () => {
    // 5 % of 1,000,000, by shares 40 / 30 / 20 / 10 / 10 (out of 110).
    expect(familyBudget('individual', 1_000_000, settings.cap)).toBe(18_181);
    expect(familyBudget('flash', 1_000_000, settings.cap)).toBe(4_545);
    expect(familyBudget('daily', 1_000_000, settings.cap)).toBe(4_545);
    expect(familyBudget('flash', 1_000_000, { ...settings.cap, percent: 0 })).toBeNull();
    expect(applyCap(500, 5_000, 4_800)).toEqual({ amount: 200, capped: true });
    expect(applyCap(500, 5_000, 6_000)).toEqual({ amount: 0, capped: true });
    expect(applyCap(500, null, 9_999)).toEqual({ amount: 500, capped: false });
  });

  it('checks hours that cross midnight', () => {
    expect(withinHours('23:00', { from: '18:00', to: '01:00' })).toBe(true);
    expect(withinHours('00:30', { from: '18:00', to: '01:00' })).toBe(true);
    expect(withinHours('12:00', { from: '18:00', to: '01:00' })).toBe(false);
    expect(withinHours('12:00', undefined)).toBe(true);
  });

  it('finds the Paris day and when it ends, across both clock changes', () => {
    expect(parisDay(new Date('2026-11-17T22:59:59Z'))).toBe('2026-11-17');
    expect(parisDay(new Date('2026-11-17T23:00:00Z'))).toBe('2026-11-18');
    expect(endOfParisDay('2026-11-17').toISOString()).toBe('2026-11-17T23:00:00.000Z');
    expect(endOfParisDay('2026-07-01').toISOString()).toBe('2026-07-01T22:00:00.000Z');
    // The nights of the clock changes: the day ends at the next midnight's offset.
    expect(endOfParisDay('2026-03-28').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(endOfParisDay('2026-10-24').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(endOfParisDay('2026-03-29').toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(endOfParisDay('2026-10-25').toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
  });

  it('draws distinct daily quests by weight, with a quantity in range', () => {
    const quests = [
      { id: 'a', weight: 1, range: { min: 5, max: 5 } },
      { id: 'b', weight: 3, range: { min: 10, max: 20 } },
      { id: 'c', weight: 1, range: { min: 1, max: 2 } },
    ];
    const draws = Array.from({ length: 200 }, () => drawDaily(quests, 2));
    for (const draw of draws) {
      expect(draw).toHaveLength(2);
      expect(new Set(draw.map((entry) => entry.quest.id)).size).toBe(2);
      for (const entry of draw) {
        expect(entry.quantity).toBeGreaterThanOrEqual(entry.quest.range.min);
        expect(entry.quantity).toBeLessThanOrEqual(entry.quest.range.max);
      }
    }
    const firstB = draws.filter((draw) => draw[0]!.quest.id === 'b').length;
    expect(firstB).toBeGreaterThan(80);
    expect(drawDaily(quests, 10)).toHaveLength(3);
    expect(drawDaily([], 3)).toEqual([]);
    // random() just below 1 picks the last quest and the top of its range.
    expect(drawDaily(quests, 1, () => 0.999_999)).toEqual([{ quest: quests[2], quantity: 2 }]);
  });
});
