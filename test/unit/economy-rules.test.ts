import { describe, expect, it } from 'vitest';

import {
  canManage,
  canSpend,
  daysBetween,
  gini,
  histogram,
  isBalanced,
  mergeLegs,
  topShare,
} from '../../server/services/economy/rules.ts';
import { economyHandle, economyTransferBody } from '../../shared/schemas/economy.ts';

describe('economy rules', () => {
  it('lets owners and members spend, and only owners manage', () => {
    expect(canSpend('owner')).toBe(true);
    expect(canSpend('member')).toBe(true);
    expect(canSpend('viewer')).toBe(false);
    expect(canManage('member')).toBe(false);
    expect(canManage('owner')).toBe(true);
  });

  it('accepts only transactions whose lines add up to zero', () => {
    expect(isBalanced([{ amount: -5 }, { amount: 5 }])).toBe(true);
    expect(isBalanced([{ amount: -5 }, { amount: 4 }])).toBe(false);
    expect(isBalanced([{ amount: 0 }, { amount: 0 }])).toBe(false);
    expect(isBalanced([{ amount: 0 }])).toBe(false);
  });

  it('merges lines of the same account', () => {
    expect(
      mergeLegs([
        { accountId: 'a', amount: -5 },
        { accountId: 'b', amount: 3 },
        { accountId: 'b', amount: 2 },
      ]),
    ).toEqual([
      { accountId: 'a', amount: -5 },
      { accountId: 'b', amount: 5 },
    ]);
  });

  it('measures how unequal balances are', () => {
    expect(gini([10, 10, 10])).toBe(0);
    expect(gini([0, 0, 0, 100])).toBeCloseTo(0.75);
    expect(topShare([90, 5, 5])).toBe(0.9);
    expect(topShare([])).toBe(0);
    expect(histogram([0, 50, 150, 200_000]).map((bucket) => bucket.count)).toEqual([
      1, 1, 1, 0, 0, 0, 0, 1,
    ]);
  });

  it('lists the days of a range across a month', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('normalizes handles and keeps the reserved ones', () => {
    expect(economyHandle.parse('#Casino-Royal')).toBe('casino-royal');
    expect(economyHandle.safeParse('lnb').success).toBe(false);
    expect(economyHandle.safeParse('-casino').success).toBe(false);
    expect(economyHandle.safeParse('ab').success).toBe(false);
  });

  it('pays without a player only for a casino payout', () => {
    const base = {
      idempotencyKey: '7b0f4a3e-6d1c-4b8e-9f2a-1c3d5e7f9a0b',
      to: { player: '7b0f4a3e-6d1c-4b8e-9f2a-1c3d5e7f9a0b' },
      amount: 5,
    };
    expect(economyTransferBody.safeParse({ ...base, from: { account: 'casino' } }).success).toBe(
      false,
    );
    expect(
      economyTransferBody.safeParse({ ...base, from: { account: 'casino' }, kind: 'casino' })
        .success,
    ).toBe(true);
    expect(
      economyTransferBody.safeParse({
        ...base,
        from: { player: base.to.player },
        to: { player: base.to.player, account: 'casino' },
      }).success,
    ).toBe(false);
  });
});
