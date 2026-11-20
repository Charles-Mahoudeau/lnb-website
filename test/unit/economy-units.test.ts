import { describe, expect, it } from 'vitest';

import {
  centsResponseToLegacy,
  legacyRequestToCents,
  MONEY_FIELDS,
  unitsOfHeader,
  usesEconomyUnits,
} from '../../server/lib/economy-units.ts';
import { economyMintBody, economyTransferBody } from '../../shared/schemas/economy.ts';

const KEY = '7b0f4a3e-6d1c-4b8e-9f2a-1c3d5e7f9a0b';
const PLAYER = '3a5c8d2e-1b4f-4e6a-8c7d-9e0f1a2b3c4d';

describe('X-Economy-Units', () => {
  it('applies to the Minecraft server routes only', () => {
    expect(usesEconomyUnits('/api/economy/server/transfers')).toBe(true);
    expect(usesEconomyUnits('/api/quests/server/config')).toBe(true);
    expect(usesEconomyUnits('/api/economy/server/market/orders')).toBe(false);
    expect(usesEconomyUnits('/api/economy/me')).toBe(false);
    expect(usesEconomyUnits('/api/economy/admin/settings')).toBe(false);
    expect(usesEconomyUnits('/api/quests')).toBe(false);
  });

  it('reads the header: cents, or legacy without it', () => {
    expect(unitsOfHeader('cents')).toBe('cents');
    expect(unitsOfHeader(' Cents ')).toBe('cents');
    expect(unitsOfHeader(null)).toBe('lnbits');
    expect(unitsOfHeader(undefined)).toBe('lnbits');
    expect(unitsOfHeader('lnbits')).toBe('lnbits');
    expect(unitsOfHeader('euros')).toBeNull();
  });

  it('turns a legacy request, in whole LNBits, into cents before validation', () => {
    const body = {
      idempotencyKey: KEY,
      from: { player: PLAYER },
      to: { player: PLAYER },
      amount: 5,
    };
    const converted = legacyRequestToCents('/api/economy/server/transfers', body);
    expect(converted).toEqual({ ...body, amount: 500 });
    expect(economyTransferBody.safeParse(converted).success).toBe(true);
    // The same request in cents is read as it is.
    expect(economyTransferBody.parse({ ...body, amount: 500 }).amount).toBe(500);
    // The original is not changed.
    expect(body.amount).toBe(5);
  });

  it('converts every money field of a request, however deep', () => {
    expect(
      legacyRequestToCents('/api/economy/server/shops', {
        sellPrice: 10,
        buyPrice: 4,
        lots: 3,
        item: { count: 64 },
      }),
    ).toEqual({ sellPrice: 1000, buyPrice: 400, lots: 3, item: { count: 64 } });
    expect(
      legacyRequestToCents('/api/economy/server/shops/x/orders', { expectedLotPrice: 7, lots: 2 }),
    ).toEqual({ expectedLotPrice: 700, lots: 2 });
    expect(legacyRequestToCents('/api/economy/server/auctions', { price: 250, count: 1 })).toEqual({
      price: 25_000,
      count: 1,
    });
  });

  it('leaves a legacy decimal alone, so the schema refuses it', () => {
    const converted = legacyRequestToCents('/api/economy/server/mints', {
      idempotencyKey: KEY,
      player: PLAYER,
      amount: 1.5,
      reason: 'mobDrop',
    });
    expect(economyMintBody.safeParse(converted).success).toBe(false);
  });

  it('rejects a fractional amount sent in cents', () => {
    expect(
      economyMintBody.safeParse({
        idempotencyKey: KEY,
        player: PLAYER,
        amount: 1.5,
        reason: 'mobDrop',
      }).success,
    ).toBe(false);
  });

  it('rounds a response down to whole LNBits for a legacy caller', () => {
    expect(
      centsResponseToLegacy('/api/economy/server/transfers', {
        transactionId: 9,
        replayed: false,
        amount: 1999,
        from: { accountId: 'a', handle: null, balance: 123_456 },
        to: { accountId: 'b', handle: '#x', balance: 99 },
      }),
    ).toEqual({
      transactionId: 9,
      replayed: false,
      amount: 19,
      from: { accountId: 'a', handle: null, balance: 1234 },
      to: { accountId: 'b', handle: '#x', balance: 0 },
    });
  });

  it('round-trips whole LNBits through legacy mode unchanged', () => {
    const request = { amount: 12 };
    const cents = legacyRequestToCents('/api/economy/server/mints', request) as { amount: number };
    const answer = centsResponseToLegacy('/api/economy/server/mints', {
      amount: cents.amount,
      to: { balance: cents.amount * 3 },
    });
    expect(answer).toEqual({ amount: 12, to: { balance: 36 } });
  });

  it('answers the other money fields of the server routes', () => {
    expect(
      centsResponseToLegacy('/api/economy/server/players/x', {
        casinoLicensePrice: 10_000_050,
        accounts: [{ balance: 250 }],
      }),
    ).toEqual({ casinoLicensePrice: 100_000, accounts: [{ balance: 2 }] });
    expect(
      centsResponseToLegacy('/api/economy/server/auctions', {
        items: [{ price: 12_345, count: 3 }],
      }),
    ).toEqual({ items: [{ price: 123, count: 3 }] });
    expect(
      centsResponseToLegacy('/api/economy/server/auctions/x/buy', { amount: 1000, tax: 99 }),
    ).toEqual({ amount: 10, tax: 0 });
    expect(
      centsResponseToLegacy('/api/economy/server/shops/x/orders', { lotPrice: 150, amount: 450 }),
    ).toEqual({ lotPrice: 1, amount: 4 });
  });

  it('names every money field in one list', () => {
    for (const field of [
      'amount',
      'balance',
      'price',
      'sellPrice',
      'buyPrice',
      'lotPrice',
      'expectedLotPrice',
      'tax',
      'casinoLicensePrice',
      'startingBalance',
      'rewardToday',
    ]) {
      expect(MONEY_FIELDS.has(field)).toBe(true);
    }
  });

  it('leaves quest counts and base rewards alone', () => {
    // A community contribution's amount counts the objective, not money.
    const contribution = { idempotencyKey: KEY, items: [{ player: PLAYER, amount: 40 }] };
    expect(
      legacyRequestToCents('/api/quests/server/community/abc/contributions', contribution),
    ).toEqual(contribution);
    // The config keeps definitions as they are and converts what a tier pays today.
    const config = {
      quests: [{ family: 'individual', tiers: [{ amount: 100, reward: 50 }] }],
      community: { tiers: [{ name: 'a', at: 50, reward: 100, rewardToday: 12_345 }] },
    };
    expect(centsResponseToLegacy('/api/quests/server/config', config)).toEqual({
      quests: config.quests,
      community: { tiers: [{ name: 'a', at: 50, reward: 100, rewardToday: 123 }] },
    });
  });

  it('answers quest rewards and podiums', () => {
    expect(
      centsResponseToLegacy('/api/quests/server/advancements', {
        rank: 1,
        amount: 7400,
        podium: [{ rank: 1, username: 'x', amount: 7400 }],
        to: { accountId: 'a', handle: null, balance: 10_099 },
      }),
    ).toEqual({
      rank: 1,
      amount: 74,
      podium: [{ rank: 1, username: 'x', amount: 74 }],
      to: { accountId: 'a', handle: null, balance: 100 },
    });
  });

  it('keeps null, strings and booleans', () => {
    expect(
      legacyRequestToCents('/api/economy/server/accounts', { name: 'x', balance: null, ok: true }),
    ).toEqual({ name: 'x', balance: null, ok: true });
  });
});
