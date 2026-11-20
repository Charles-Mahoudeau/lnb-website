import type { MarketPublic } from '../../shared/schemas/market.ts';

// What the public Market page works out in the browser from `GET /api/market` (docs/market.md).

type PublicItem = MarketPublic['items'][number];

/** The five sellable items furthest above their base price, and the five buyable ones furthest below. */
export function marketMovers(items: PublicItem[], count = 5) {
  return {
    paying: items
      .filter((item) => item.sellable)
      .toSorted((a, b) => b.deltaPercent - a.deltaPercent)
      .slice(0, count),
    cheapest: items
      .filter((item) => item.buyable)
      .toSorted((a, b) => a.deltaPercent - b.deltaPercent)
      .slice(0, count),
  };
}

/** "+12.3%" or "−8%": one decimal under 10 points, a real minus sign. */
export function formatMarketDelta(percent: number, locale: string): string {
  const rounded = Math.abs(percent) < 10 ? Math.round(percent * 10) / 10 : Math.round(percent);
  const text = new Intl.NumberFormat(locale, {
    maximumFractionDigits: Math.abs(percent) < 10 ? 1 : 0,
  }).format(Math.abs(rounded));
  if (rounded === 0) return `${text}%`;
  return `${rounded < 0 ? '−' : '+'}${text}%`;
}

/** The meter of a tier: how full it is against the second threshold, and where the first one sits. */
export function marketMeter(nominal: number, q1: number, q2: number) {
  const share = (value: number) => (q2 > 0 ? Math.min(100, Math.max(0, (value / q2) * 100)) : 0);
  return { fill: share(nominal), tick: share(q1) };
}

/** An item far from its base price is plentiful (cheap) or scarce (dear), as a share of base. */
export const MARKET_MOOD_PERCENT = 30;
export function marketMood(deltaPercent: number): 'plentiful' | 'scarce' | null {
  if (deltaPercent <= -MARKET_MOOD_PERCENT) return 'plentiful';
  if (deltaPercent >= MARKET_MOOD_PERCENT) return 'scarce';
  return null;
}
