import type { MARKET_PERIODS, MarketPublic } from '#shared/schemas/market';

export type MarketPeriod = (typeof MARKET_PERIODS)[number];
export type MarketHistoryView = { period: MarketPeriod; points: { at: string; price: number }[] };

const REFRESH_MS = 5 * 60_000;

/** The public Market page (docs/market.md). Refetched every five minutes, only while the tab shows. */
export function useMarket() {
  const result = useFetch<MarketPublic>('/api/market', { key: 'market-public' });
  if (import.meta.client) {
    let timer: ReturnType<typeof setInterval> | undefined;
    onMounted(() => {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void result.refresh();
      }, REFRESH_MS);
    });
    onBeforeUnmount(() => {
      clearInterval(timer);
    });
  }
  return result;
}

export function marketHistoryOf(id: string, period: MarketPeriod) {
  return $fetch<MarketHistoryView>(`/api/market/items/${encodeURIComponent(id)}/history`, {
    query: { period },
  });
}
