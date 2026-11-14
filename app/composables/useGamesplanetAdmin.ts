import type {
  GamesplanetAdminView,
  GamesplanetProblem,
  GamesplanetSearchView,
  GamesplanetSettingsBody,
  GamesplanetSyncBody,
  GamesplanetSyncView,
} from '#shared/schemas/gamesplanet';
import { GAMESPLANET_PROBLEMS } from '#shared/schemas/gamesplanet';

// The Gamesplanet section of the admin area. Writes throw a GamesplanetError with the API's problem.

/** A refused Gamesplanet request, with the reason the API gave. */
export class GamesplanetError extends Error {
  constructor(readonly problem: GamesplanetProblem | 'failed') {
    super(`Gamesplanet request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new GamesplanetError(
      GAMESPLANET_PROBLEMS.includes(problem as GamesplanetProblem)
        ? (problem as GamesplanetProblem)
        : 'failed',
    );
  }
}

/** The affiliate ref, the pins, the first best sellers and the state of the feeds. */
export function useAdminGamesplanet() {
  return useFetch<GamesplanetAdminView>('/api/admin/gamesplanet', { key: 'gamesplanet-admin' });
}

/** What admins can do. Each throws a GamesplanetError when refused. */
export const gamesplanetActions = {
  setSettings: (body: GamesplanetSettingsBody) =>
    call(() =>
      $fetch<{ refCode: string }>('/api/admin/gamesplanet/settings', { method: 'PATCH', body }),
    ),
  search: (q: string) =>
    call(() => $fetch<GamesplanetSearchView>('/api/admin/gamesplanet/search', { query: { q } })),
  pin: (uid: string) =>
    call(() => $fetch('/api/admin/gamesplanet/pins', { method: 'POST', body: { uid } })),
  unpin: (uid: string) =>
    call(() => $fetch(`/api/admin/gamesplanet/pins/${uid}`, { method: 'DELETE' })),
  move: (uid: string, direction: 'up' | 'down') =>
    call(() =>
      $fetch(`/api/admin/gamesplanet/pins/${uid}/move`, { method: 'POST', body: { direction } }),
    ),
  sync: (feed: GamesplanetSyncBody['feed']) =>
    call(() =>
      $fetch<GamesplanetSyncView>('/api/admin/gamesplanet/sync', {
        method: 'POST',
        body: { feed },
      }),
    ),
};
