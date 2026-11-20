import { describe, expect, it } from 'vitest';

import {
  marketDrift,
  marketInverse,
  marketIntegral,
  marketItemName,
  marketPRef,
  marketQuotePurchase,
  marketQuoteSale,
  marketRate,
  marketSA,
  marketSB,
  marketStockForPrice,
} from '../../shared/utils/market.ts';
import type { MarketCurve } from '../../shared/utils/market.ts';

// The vectors of docs/market-mod.md 2.4: the mod's pricing code must match them too.

const item: MarketCurve = {
  p0: 0.05,
  pMin: 0.0025,
  pMax: 0.15,
  s0: 120000,
  sMin: 12000,
  sMax: 1200000,
  k: 1.3,
  alpha: 0.05,
};
const sigma = 0.15;
const tier = { q1: 5000, q2: 15000, mid: 0.5, tail: 0.1 };
const sell = (stock: number, window: number, quantity: number) =>
  marketQuoteSale(item, sigma, tier, stock, window, quantity);

describe('market reference price', () => {
  it('finds the breakpoints', () => {
    expect(marketSA(item)).toBeCloseTo(51542.430769, 5);
    expect(marketSB(item)).toBeCloseTo(1202191.216004, 4);
  });

  it.each([
    [120000, 0.05],
    [60000, 0.123114],
    [200000, 0.025738],
    [12000, 0.15],
    [1200000, 0.002506],
  ])('pRef(%d) is %d', (stock, price) => {
    expect(marketPRef(item, stock)).toBeCloseTo(price, 6);
  });

  it('inverts its integral on every piece, and with k = 1', () => {
    for (const curve of [item, { ...item, k: 1 }, { ...item, k: 0.5 }]) {
      for (const [a, value] of [
        [20000, 100],
        [60000, 900],
        [130000, 400],
        [1190000, 50],
        [1250000, 3],
      ] as const) {
        const b = marketInverse(curve, a, value);
        expect(marketIntegral(curve, a, b)).toBeCloseTo(value, 6);
      }
    }
  });

  it('is continuous and additive', () => {
    const whole = marketIntegral(item, 30000, 400000);
    const split = marketIntegral(item, 30000, 70000) + marketIntegral(item, 70000, 400000);
    expect(split).toBeCloseTo(whole, 9);
  });
});

describe('market purchase', () => {
  it('buys one item at the spread', () => {
    expect(marketQuotePurchase(item, sigma, 120000, 1).total).toBe(6);
  });

  it('matches the vectors', () => {
    const big = marketQuotePurchase(item, sigma, 120000, 10000);
    expect(big.total).toBe(60829);
    expect(big.stock).toBe(110000);
    const floor = marketQuotePurchase(item, sigma, 20000, 10000);
    expect(floor.total).toBe(172500);
    expect(floor.stock).toBe(12000);
  });

  it('never lowers the stock below sMin, and stays at the price there', () => {
    const quote = marketQuotePurchase(item, sigma, 12000, 100);
    expect(quote.stock).toBe(12000);
    expect(quote.total).toBe(Math.ceil(100 * 0.15 * 1.15 * 100 - 1e-6));
  });
});

describe('market sale', () => {
  it('pays the vectors', () => {
    const one = sell(120000, 0, 1);
    expect(one.total).toBe(4);

    const small = sell(120000, 0, 10000);
    expect(small.total).toBe(40335);
    expect(small.stock).toBeCloseTo(130000, 6);
    expect(small.window).toBeCloseTo(474.535973, 6);

    const large = sell(120000, 0, 100000);
    expect(large.total).toBe(282652);
    expect(large.stock).toBeCloseTo(220000, 6);
    expect(large.window).toBeCloseTo(3325.317811, 6);

    const warm = sell(120000, 4000, 100000);
    expect(warm.total).toBe(197672);
    expect(warm.stock).toBeCloseTo(181187.85373, 4);
    expect(warm.window).toBeCloseTo(7651.121393, 6);

    const tail = sell(120000, 16000, 2304);
    expect(tail.total).toBe(977);
    expect(tail.stock).toBeCloseTo(120230.4, 6);

    const top = sell(1150000, 0, 10000);
    expect(top.total).toBe(2238);
    expect(top.stock).toBeCloseTo(1160000, 6);
  });

  it('gives the numbers of the vectors under 1e-6, not only the cents', () => {
    expect(sell(120000, 0, 10000).brackets.reduce((sum, b) => sum + b.total, 0)).toBe(40335);
    // 403.355577 LNBits: 40,335.5577 cents, so the total is floored.
    const exact = (1 - sigma) * marketIntegral(item, 120000, 130000);
    expect(exact).toBeCloseTo(403.355577, 6);
    expect(marketDrift(item, 180000, new Date(0), new Date(24 * 3_600_000))).toBeCloseTo(
      137519.34146,
      4,
    );
  });

  it('cuts the order at the bracket boundaries and the parts add up', () => {
    const quote = sell(120000, 4000, 100000);
    expect(quote.brackets.map((part) => part.rate)).toEqual([1, 0.5]);
    const long = sell(60000, 13000, 200000);
    expect(long.brackets.map((part) => part.rate)).toEqual([0.5, 0.1]);
    for (const q of [quote, long]) {
      expect(q.brackets.reduce((sum, part) => sum + part.total, 0)).toBe(q.total);
    }
    expect(quote.brackets.reduce((sum, part) => sum + part.quantity, 0)).toBeCloseTo(100000, 4);
    expect(long.brackets.reduce((sum, part) => sum + part.quantity, 0)).toBeCloseTo(200000, 3);
  });

  it('pays two orders of 50,000 like one of 100,000', () => {
    const whole = sell(120000, 0, 100000);
    const first = sell(120000, 0, 50000);
    const second = sell(first.stock, first.window, 50000);
    expect(Math.abs(first.total + second.total - whole.total)).toBeLessThanOrEqual(1);
    expect(second.stock).toBeCloseTo(whole.stock, 4);
    expect(second.window).toBeCloseTo(whole.window, 4);
  });

  it('pays the same in one order as in many, wherever the cuts fall', () => {
    const whole = sell(120000, 0, 6000);
    let stock = 120000;
    let window = 0;
    let paid = 0;
    for (let i = 0; i < 60; i++) {
      const part = sell(stock, window, 100);
      paid += part.total;
      stock = part.stock;
      window = part.window;
    }
    // Each part floors its own cents: at most one cent lost per order.
    expect(whole.total - paid).toBeGreaterThanOrEqual(0);
    expect(whole.total - paid).toBeLessThanOrEqual(60);
    expect(stock).toBeCloseTo(whole.stock, 3);
  });

  it('never profits from a round trip at the same moment', () => {
    for (const stock of [8000, 40000, 120000, 400000, 1190000]) {
      for (const quantity of [1, 7, 64, 2304, 20000]) {
        const bought = marketQuotePurchase(item, sigma, stock, quantity);
        const bought2 = sell(bought.stock, 0, quantity);
        // Sell what was bought right after: the stock is back where it was, at the same prices.
        expect(bought2.total).toBeLessThanOrEqual(bought.total);
        const sold = sell(stock, 0, quantity);
        const back = marketQuotePurchase(item, sigma, sold.stock, quantity);
        expect(sold.total).toBeLessThanOrEqual(back.total);
      }
    }
  });

  it('keeps paying at the ceiling price when the stock is at sMax', () => {
    const quote = sell(item.sMax, 0, 1000);
    expect(quote.stock).toBe(item.sMax);
    expect(quote.total).toBe(Math.floor(1000 * marketPRef(item, item.sMax) * 0.85 * 100 + 1e-6));
  });
});

describe('market drift', () => {
  it('matches the vectors', () => {
    expect(marketDrift(item, 180000, new Date(0), new Date(24 * 3_600_000))).toBeCloseTo(
      137519.34146,
      4,
    );
    expect(marketDrift(item, 12000, new Date(0), new Date(36.5 * 3_600_000))).toBeCloseTo(
      103391.311169,
      4,
    );
  });

  it('does nothing in the past or at once', () => {
    expect(marketDrift(item, 5, new Date(10), new Date(0))).toBe(5);
  });
});

describe('market helpers', () => {
  it('finds the rate and what is left in a window', () => {
    expect(marketRate(tier, 0)).toEqual({ rate: 1, toNextBracket: 5000 });
    expect(marketRate(tier, 5000)).toEqual({ rate: 0.5, toNextBracket: 10000 });
    expect(marketRate(tier, 15000)).toEqual({ rate: 0.1, toNextBracket: null });
  });

  it('finds the stock of a price, for keepPrice', () => {
    const stock = marketStockForPrice(item, 0.123114);
    expect(stock).toBeCloseTo(60000, -1);
    expect(marketPRef(item, marketStockForPrice(item, 0.05))).toBeCloseTo(0.05, 9);
  });

  it('names an item from its registry id', () => {
    expect(marketItemName('minecraft:oak_log')).toBe('Oak Log');
    expect(marketItemName('create:andesite_alloy')).toBe('Andesite Alloy');
  });
});
