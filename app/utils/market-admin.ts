import { marketPRef, marketQuotePurchase, marketQuoteSale } from '#shared/utils/market';
import type { MarketBrackets, MarketCurve } from '#shared/utils/market';

// What the Market admin draws and simulates in the browser, with the same pricing functions as the
// server (shared/utils/market.ts), so a quote here is the one an order would get.

/** The stock/target ratio at which an item counts as flooded, and as scarce (docs/market.md). */
export const MARKET_FLOODED = 3;
export const MARKET_SCARCE = 0.5;

export function stockStatus(stock: number, s0: number): 'flooded' | 'scarce' | null {
  const ratio = stock / s0;
  if (ratio >= MARKET_FLOODED) return 'flooded';
  if (ratio <= MARKET_SCARCE) return 'scarce';
  return null;
}

/** Where a stock ratio sits on the board's log axis, 0.1x to 10x, as a percentage from the left. */
export function ratioPosition(ratio: number): number {
  return Math.min(100, Math.max(0, ((Math.log10(Math.max(ratio, 1e-9)) + 1) / 2) * 100));
}

/** How a price compares to the base price, as a whole percentage (-42, 0, 120). */
export function percentVsBase(price: number, p0: number): number {
  return Math.round((price / p0 - 1) * 100);
}

/** A tier's thresholds (cents in the settings) as the pricing functions take them. */
export function tierBrackets(
  tiers: { tier: number; q1: number; q2: number; midPercent: number; tailPercent: number }[],
  tier: number,
): MarketBrackets | undefined {
  const found = tiers.find((entry) => entry.tier === tier);
  return (
    found && {
      q1: found.q1 / 100,
      q2: found.q2 / 100,
      mid: found.midPercent / 100,
      tail: found.tailPercent / 100,
    }
  );
}

export interface CurveSample {
  stock: number;
  price: number;
}

/** The reference price at `count + 1` evenly spaced stocks from sMin to `upTo`. */
export function curveSamples(curve: MarketCurve, upTo: number, count = 120): CurveSample[] {
  return Array.from({ length: count + 1 }, (_, n) => {
    const stock = Math.max(curve.sMin, (n / count) * upTo);
    return { stock, price: marketPRef(curve, stock) };
  });
}

export interface SimulatedOrder {
  direction: 'sell' | 'buy';
  /** Cents. */
  total: number;
  /** The reference price after the order, LNBits per item. */
  priceAfter: number;
  /** A sale only: what each rate paid. */
  brackets: { rate: number; quantity: number; total: number }[];
}

/** What an order of `quantity` would pay or cost from `stock`, for a player who sold `window` LNBits. */
export function simulateOrder(input: {
  curve: MarketCurve;
  sigma: number;
  brackets: MarketBrackets;
  stock: number;
  window: number;
  quantity: number;
  direction: 'sell' | 'buy';
}): SimulatedOrder {
  const { curve, sigma, brackets, quantity } = input;
  const stock = Math.min(curve.sMax, Math.max(curve.sMin, input.stock));
  if (input.direction === 'buy') {
    const bought = marketQuotePurchase(curve, sigma, stock, quantity);
    return {
      direction: 'buy',
      total: bought.total,
      priceAfter: marketPRef(curve, bought.stock),
      brackets: [],
    };
  }
  const sale = marketQuoteSale(curve, sigma, brackets, stock, input.window, quantity);
  return {
    direction: 'sell',
    total: sale.total,
    priceAfter: marketPRef(curve, sale.stock),
    brackets: sale.brackets,
  };
}

/** A price per item in LNBits, which can be below a cent: three significant digits ("0.0025", "1.23"). */
export function formatItemPrice(price: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }).format(price);
}

/** "+12%" or "−8%", with a real minus sign. */
export function formatPercentVsBase(percent: number): string {
  return `${percent < 0 ? '−' : '+'}${String(Math.abs(percent))}%`;
}
