import type { PosterBody, PosterProblem, PosterView } from '#shared/schemas/posters';
import { POSTER_PROBLEMS } from '#shared/schemas/posters';

// The Posters section of the admin area. Writes throw a PosterError with the API's problem.

/** A refused posters request, with the reason the API gave. */
export class PosterError extends Error {
  constructor(readonly problem: PosterProblem | 'failed') {
    super(`Posters request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new PosterError(
      POSTER_PROBLEMS.includes(problem as PosterProblem) ? (problem as PosterProblem) : 'failed',
    );
  }
}

/** The whole library, last saved first. */
export function usePosterList() {
  return useFetch<{ items: PosterView[] }>('/api/admin/posters', { key: 'poster-list' });
}

export function usePoster(id: string) {
  return useFetch<PosterView>(`/api/admin/posters/${id}`, { key: `poster-${id}` });
}

/** What events managers can do to posters. Each throws a PosterError when refused. */
export const posterActions = {
  create: (body: PosterBody) =>
    call(() => $fetch<{ id: string }>('/api/admin/posters', { method: 'POST', body })),
  save: (id: string, body: PosterBody) =>
    call(() => $fetch(`/api/admin/posters/${id}`, { method: 'PUT', body })),
  duplicate: (id: string, name: string) =>
    call(() =>
      $fetch<{ id: string }>(`/api/admin/posters/${id}/duplicate`, {
        method: 'POST',
        body: { name },
      }),
    ),
  remove: (id: string) => call(() => $fetch(`/api/admin/posters/${id}`, { method: 'DELETE' })),
};
