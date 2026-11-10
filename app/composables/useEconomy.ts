import type {
  EconomyAccountDetail,
  EconomyBaltop,
  EconomyCreateBody,
  EconomyInviteBody,
  EconomyMe,
  EconomyMePatchBody,
  EconomyProblem,
  EconomyRole,
  EconomyTransactionPage,
} from '#shared/schemas/economy';
import { ECONOMY_PROBLEMS } from '#shared/schemas/economy';

// The bank pages (/minecraft/bank, /minecraft/baltop). Writes throw an EconomyError with the
// API's problem. See docs/economy.md.

/** A refused economy request, with the reason the API gave. */
export class EconomyError extends Error {
  constructor(readonly problem: EconomyProblem | 'failed') {
    super(`Economy request refused: ${problem}`);
  }
}

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

/** The signed-in player's accounts, invitations and preferences. */
export function useEconomyMe() {
  return useFetch<EconomyMe>('/api/economy/me', { key: 'economy-me' });
}

/** One account with its members, refetched when the selection changes. */
export function useEconomyAccount(accountId: Ref<string>) {
  return useFetch<EconomyAccountDetail>(() => `/api/economy/accounts/${accountId.value}`, {
    key: computed(() => `economy-account-${accountId.value}`),
  });
}

/** The first page of an account's history, refetched when the selection changes. */
export function useEconomyHistory(accountId: Ref<string>) {
  return useFetch<EconomyTransactionPage>(
    () => `/api/economy/accounts/${accountId.value}/transactions`,
    { key: computed(() => `economy-history-${accountId.value}`) },
  );
}

export function useBaltop() {
  return useFetch<EconomyBaltop>('/api/economy/baltop', { key: 'economy-baltop' });
}

/** What players can do with their accounts. Each throws an EconomyError when refused. */
export const economyActions = {
  updateMe: (body: EconomyMePatchBody) =>
    call(() => $fetch<EconomyMe>('/api/economy/me', { method: 'PATCH', body })),
  moreHistory: (accountId: string, cursor: string) =>
    call(() =>
      $fetch<EconomyTransactionPage>(`/api/economy/accounts/${accountId}/transactions`, {
        query: { cursor },
      }),
    ),
  create: (body: EconomyCreateBody) =>
    call(() => $fetch<EconomyAccountDetail>('/api/economy/accounts', { method: 'POST', body })),
  rename: (accountId: string, name: string) =>
    call(() =>
      $fetch<EconomyAccountDetail>(`/api/economy/accounts/${accountId}`, {
        method: 'PATCH',
        body: { name },
      }),
    ),
  close: (accountId: string) =>
    call(() => $fetch(`/api/economy/accounts/${accountId}`, { method: 'DELETE' })),
  invite: (accountId: string, body: EconomyInviteBody) =>
    call(() =>
      $fetch<EconomyAccountDetail>(`/api/economy/accounts/${accountId}/invitations`, {
        method: 'POST',
        body,
      }),
    ),
  cancelInvitation: (accountId: string, invitationId: string) =>
    call(() =>
      $fetch(`/api/economy/accounts/${accountId}/invitations/${invitationId}`, {
        method: 'DELETE',
      }),
    ),
  setRole: (accountId: string, userId: string, role: EconomyRole) =>
    call(() =>
      $fetch(`/api/economy/accounts/${accountId}/members/${userId}`, {
        method: 'PATCH',
        body: { role },
      }),
    ),
  removeMember: (accountId: string, userId: string) =>
    call(() =>
      $fetch(`/api/economy/accounts/${accountId}/members/${userId}`, { method: 'DELETE' }),
    ),
  accept: (invitationId: string) =>
    call(() =>
      $fetch<EconomyMe>(`/api/economy/invitations/${invitationId}/accept`, { method: 'POST' }),
    ),
  decline: (invitationId: string) =>
    call(() =>
      $fetch<EconomyMe>(`/api/economy/invitations/${invitationId}/decline`, { method: 'POST' }),
    ),
};
