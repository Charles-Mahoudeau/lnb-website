import type {
  ModListPage,
  ModProblem,
  ModSearchResult,
  ModSuggestBody,
  ModVoteResult,
} from '#shared/schemas/mods';
import { MOD_PROBLEMS } from '#shared/schemas/mods';

/** A refused mod list request, with the reason the API gave. */
export class ModError extends Error {
  constructor(readonly problem: ModProblem | 'failed') {
    super(`Mod list request refused: ${problem}`);
  }
}

/** Turns a $fetch error into a ModError with the API's problem code. */
export function toModError(error: unknown): ModError {
  const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
  return new ModError(
    MOD_PROBLEMS.includes(problem as ModProblem) ? (problem as ModProblem) : 'failed',
  );
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw toModError(error);
  }
}

/** Searches Modrinth and CurseForge through the site. Shared by the suggest and add modals. */
export function searchMods(q: string) {
  return call(() =>
    $fetch<{ items: ModSearchResult[] }>('/api/minecraft/mods/search', { query: { q } }),
  );
}

/** The mod list page (/minecraft/mod-list): both tabs, and what the viewer can do. */
export function useModList() {
  const page = useFetch<ModListPage>('/api/minecraft/mods', { key: 'mod-list' });

  return {
    page,
    vote: (id: number, value: -1 | 0 | 1) =>
      call(() =>
        $fetch<ModVoteResult>(`/api/minecraft/mods/${String(id)}/vote`, {
          method: 'PUT',
          body: { value },
        }),
      ),
    suggest: (body: ModSuggestBody) =>
      call(() => $fetch<{ id: number }>('/api/minecraft/mods', { method: 'POST', body })),
    editReason: (id: number, reason: string) =>
      call(() =>
        $fetch(`/api/minecraft/mods/${String(id)}`, { method: 'PATCH', body: { reason } }),
      ),
    withdraw: (id: number) =>
      call(() => $fetch(`/api/minecraft/mods/${String(id)}`, { method: 'DELETE' })),
    dismissRemoval: (id: number) =>
      call(() => $fetch(`/api/minecraft/mods/${String(id)}/dismiss-removal`, { method: 'POST' })),
  };
}
