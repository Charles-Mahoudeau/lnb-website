import type {
  WardenAppealView,
  WardenMe,
  WardenPage,
  WardenProblem,
  WardenSessionView,
} from '#shared/schemas/warden';
import { WARDEN_PROBLEMS } from '#shared/schemas/warden';

/** A refused Warden request, with the reason the API gave. */
export class WardenError extends Error {
  constructor(readonly problem: WardenProblem | 'failed') {
    super(`Warden request refused: ${problem}`);
  }
}

/** Turns a $fetch error into a WardenError with the API's problem code. */
export function toWardenError(error: unknown): WardenError {
  const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
  return new WardenError(
    WARDEN_PROBLEMS.includes(problem as WardenProblem) ? (problem as WardenProblem) : 'failed',
  );
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw toWardenError(error);
  }
}

/**
 * The signed-in player's Warden status (/minecraft/warden), and what they can change. Pass
 * `immediate: false` to skip loading it, for students Warden isn't open to.
 */
export function useWarden(options: { immediate?: boolean } = {}) {
  const me = useFetch<WardenMe>('/api/warden/me', {
    key: 'warden-me',
    immediate: options.immediate ?? true,
  });

  return {
    me,
    regenerateToken: () =>
      call(() => $fetch<{ serverUrl: string }>('/api/warden/me/token', { method: 'POST' })),
    unlink: (uuid: string) =>
      call(() => $fetch(`/api/warden/me/accounts/${uuid}`, { method: 'DELETE' })),
    setShowRealName: (showRealName: boolean) =>
      call(() => $fetch('/api/warden/me', { method: 'PATCH', body: { showRealName } })),
    appeal: (banId: string, body: string) =>
      call(() =>
        $fetch<WardenAppealView>(`/api/warden/me/bans/${banId}/appeal`, {
          method: 'POST',
          body: { body },
        }),
      ),
    moreSessions: (cursor: string) =>
      call(() =>
        $fetch<WardenPage<WardenSessionView>>('/api/warden/me/sessions', { query: { cursor } }),
      ),
  };
}
