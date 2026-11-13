import { describe, expect, it } from 'vitest';

import {
  applyCap,
  computeIndex,
  familyBudget,
  kGlobal,
  kPlayer,
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
    expect(familyBudget('individual', 1_000_000, settings.cap)).toBe(20_000);
    expect(familyBudget('flash', 1_000_000, settings.cap)).toBe(5_000);
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
});
