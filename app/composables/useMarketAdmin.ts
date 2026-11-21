import type {
  MarketAdminItem,
  MarketAdminOrder,
  MarketAdminOverview,
  MarketAdminRecipes,
  MarketAdminStats,
  MarketItemPatchBody,
  MarketOrdersQuery,
  MarketSettingsPatch,
  MarketValidationView,
} from '#shared/schemas/market';
import { marketItemName } from '#shared/utils/market';

// The Market section of the admin (docs/market.md). Writes throw a MarketError with the problem
// the API gave and, for a loop, the loops it found.

export class MarketError extends Error {
  constructor(
    readonly problem: 'loop' | 'noRecipes' | 'notFound' | 'invalid' | 'failed',
    readonly loops: MarketValidationView['loops'] = [],
  ) {
    super(`Market request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const failure = error as {
      status?: number;
      statusCode?: number;
      data?: { data?: { problem?: string; loops?: MarketValidationView['loops'] } };
    };
    const problem = failure.data?.data?.problem;
    if (problem === 'loop') throw new MarketError('loop', failure.data?.data?.loops ?? []);
    if (problem === 'noRecipes' || problem === 'notFound') throw new MarketError(problem);
    throw new MarketError((failure.statusCode ?? failure.status) === 400 ? 'invalid' : 'failed');
  }
}

/** The settings and every item, with its price and stock now. One key: the pages share it. */
export function useMarketOverview() {
  return useFetch<MarketAdminOverview>('/api/economy/admin/market', { key: 'market-admin' });
}

export function useMarketStats() {
  return useFetch<MarketAdminStats>('/api/economy/admin/market/stats', {
    key: 'market-admin-stats',
    query: { period: '30d' },
  });
}

export const marketAdminActions = {
  orders: (query: MarketOrdersQuery) =>
    call(() =>
      $fetch<{ items: MarketAdminOrder[]; nextCursor: string | null }>(
        '/api/economy/admin/market/orders',
        { query },
      ),
    ),
  recipes: (item: string) =>
    call(() =>
      $fetch<MarketAdminRecipes>('/api/economy/admin/market/recipes', {
        query: { item, uses: item },
      }),
    ),
  validate: (item: string, fields: Partial<MarketItemPatchBody>) =>
    call(() =>
      $fetch<MarketValidationView>('/api/economy/admin/market/validate', {
        method: 'POST',
        body: { items: [{ id: item, ...fields }] },
      }),
    ),
  updateItem: (id: string, body: MarketItemPatchBody) =>
    call(() =>
      $fetch<MarketAdminItem>(`/api/economy/admin/market/items/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body,
      }),
    ),
  resetStock: (id: string, reason: string) =>
    call(() =>
      $fetch<MarketAdminItem>(
        `/api/economy/admin/market/items/${encodeURIComponent(id)}/reset-stock`,
        { method: 'POST', body: { reason } },
      ),
    ),
  updateSettings: (body: MarketSettingsPatch) =>
    call(() =>
      $fetch<MarketAdminOverview>('/api/economy/admin/market/settings', {
        method: 'PATCH',
        body,
      }),
    ),
};

/** The server's refusals, in plain words. */
export function useMarketMessages() {
  const { t, locale } = useI18n();

  const names = (ids: string[]) =>
    new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(ids.map(marketItemName));

  function loopText(loops: MarketValidationView['loops']): string {
    const first = loops[0];
    const recipe = first?.path[0];
    if (!first || !recipe) return t('admin.market.refusal.loopShort');
    return t('admin.market.refusal.loop', {
      inputs: names([...new Set(recipe.inputs.map((input) => input.id))]),
      output: marketItemName(first.item),
      cost: formatItemPrice(first.cost, locale.value),
      value: formatItemPrice(first.value, locale.value),
    });
  }

  /** "Not saved." and why. */
  function refusalText(error: MarketError): string {
    const why =
      error.problem === 'loop' ? loopText(error.loops) : t(`admin.market.refusal.${error.problem}`);
    return `${t('admin.market.refusal.notSaved')} ${why}`;
  }

  return { loopText, refusalText };
}
