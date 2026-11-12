import type {
  EconomyAccountType,
  EconomyAdjustBody,
  EconomyAdminAccountDetail,
  EconomyAdminAccountPage,
  EconomyAdminAccountsQuery,
  EconomyExport,
  EconomyFreezeBody,
  EconomyLedgerPage,
  EconomyLedgerQuery,
  EconomyPeriod,
  EconomyProblem,
  EconomySettingsBody,
  EconomySettingsView,
  EconomyStats,
  EconomyTransactionPage,
} from '#shared/schemas/economy';
import { ECONOMY_PROBLEMS } from '#shared/schemas/economy';

// The Economy section of the admin area. Writes throw an EconomyError with the API's problem.

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new EconomyError(
      ECONOMY_PROBLEMS.includes(problem as EconomyProblem) ? (problem as EconomyProblem) : 'failed',
    );
  }
}

export function useEconomyStats(period: Ref<EconomyPeriod>) {
  return useFetch<EconomyStats>('/api/economy/admin/stats', {
    key: 'economy-admin-stats',
    query: { period },
  });
}

export function useEconomyAdminAccounts(query: Ref<EconomyAdminAccountsQuery>) {
  return useFetch<EconomyAdminAccountPage>('/api/economy/admin/accounts', {
    key: 'economy-admin-accounts',
    query,
  });
}

export function useEconomyAdminAccount(accountId: string) {
  return useFetch<EconomyAdminAccountDetail>(`/api/economy/admin/accounts/${accountId}`, {
    key: `economy-admin-account-${accountId}`,
  });
}

export function useEconomyLedger(query: Ref<EconomyLedgerQuery>) {
  return useFetch<EconomyLedgerPage>('/api/economy/admin/transactions', {
    key: 'economy-admin-ledger',
    query,
  });
}

export function useEconomySettings() {
  return useFetch<EconomySettingsView>('/api/economy/admin/settings', {
    key: 'economy-admin-settings',
  });
}

/** What economy admins can do. Each throws an EconomyError when refused. */
export const economyAdminActions = {
  moreAccounts: (query: EconomyAdminAccountsQuery) =>
    call(() => $fetch<EconomyAdminAccountPage>('/api/economy/admin/accounts', { query })),
  history: (accountId: string, cursor?: string) =>
    call(() =>
      $fetch<EconomyTransactionPage>(`/api/economy/admin/accounts/${accountId}/transactions`, {
        query: { cursor },
      }),
    ),
  moreLedger: (query: EconomyLedgerQuery) =>
    call(() => $fetch<EconomyLedgerPage>('/api/economy/admin/transactions', { query })),
  adjust: (accountId: string, body: EconomyAdjustBody) =>
    call(() =>
      $fetch<EconomyAdminAccountDetail>(`/api/economy/admin/accounts/${accountId}/adjustments`, {
        method: 'POST',
        body,
      }),
    ),
  setType: (accountId: string, type: EconomyAccountType) =>
    call(() =>
      $fetch<EconomyAdminAccountDetail>(`/api/economy/admin/accounts/${accountId}`, {
        method: 'PATCH',
        body: { type },
      }),
    ),
  freeze: (accountId: string, body: EconomyFreezeBody) =>
    call(() =>
      $fetch<EconomyAdminAccountDetail>(`/api/economy/admin/accounts/${accountId}/freeze`, {
        method: 'POST',
        body,
      }),
    ),
  reverse: (transactionId: number, reason: string) =>
    call(() =>
      $fetch<{ reversalId: number }>(
        `/api/economy/admin/transactions/${String(transactionId)}/reverse`,
        {
          method: 'POST',
          body: { reason },
        },
      ),
    ),
  updateSettings: (body: EconomySettingsBody) =>
    call(() =>
      $fetch<EconomySettingsView>('/api/economy/admin/settings', { method: 'PATCH', body }),
    ),
  exportAll: () => call(() => $fetch<EconomyExport>('/api/economy/admin/export')),
  reset: (confirm: string) =>
    call(() => $fetch('/api/economy/admin/reset', { method: 'POST', body: { confirm } })),
};
