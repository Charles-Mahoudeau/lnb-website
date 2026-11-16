import { MODPACK_PROBLEMS } from '#shared/schemas/modpack';
import type {
  ModpackAddBody,
  ModpackList,
  ModpackPatchBody,
  ModpackPinBody,
  ModpackProblem,
} from '#shared/schemas/modpack';

// The Modlist of the admin area. Writes throw a ModpackError with the API's problem.

/** A refused Modlist request, with the reason the API gave. */
export class ModpackError extends Error {
  constructor(readonly problem: ModpackProblem | 'failed') {
    super(`Modlist request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new ModpackError(
      MODPACK_PROBLEMS.includes(problem as ModpackProblem) ? (problem as ModpackProblem) : 'failed',
    );
  }
}

const BASE = '/api/minecraft/admin/modpack/mods';

/** Every mod of the pack, with the manifest's revision. */
export function useAdminModpack() {
  return useFetch<ModpackList>(BASE, { key: 'modpack-admin' });
}

/** What admins can do to the pack. Each throws a ModpackError when refused. */
export const modpackActions = {
  add: (body: ModpackAddBody) => call(() => $fetch<{ id: string }>(BASE, { method: 'POST', body })),
  edit: (id: string, body: ModpackPatchBody) =>
    call(() => $fetch(`${BASE}/${id}`, { method: 'PATCH', body })),
  pinFile: (id: string, body: ModpackPinBody) =>
    call(() => $fetch(`${BASE}/${id}/file`, { method: 'PUT', body })),
  remove: (id: string) => call(() => $fetch(`${BASE}/${id}`, { method: 'DELETE' })),
};
