import { MODPACK_PROBLEMS } from '#shared/schemas/modpack';
import type {
  ModpackAddBody,
  ModpackCheckResult,
  ModpackExportMode,
  ModpackExportPreview,
  ModpackExportResult,
  ModpackList,
  ModpackPatchBody,
  ModpackPinBody,
  ModpackProblem,
  ModpackRetiredAddBody,
  ModpackRetiredAddResult,
  ModpackRetiredList,
  ModpackRetiredPatchBody,
  ModpackRetiredPlayers,
  ModpackTool,
  ModpackToolBody,
  ModpackToolList,
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
const TOOLS = '/api/minecraft/admin/modpack/tools';
const RETIRED = '/api/minecraft/admin/modpack/retired';
const EXPORT = '/api/minecraft/admin/modpack/export';

/** Every mod of the pack, with the manifest's revision. */
export function useAdminModpack() {
  return useFetch<ModpackList>(BASE, { key: 'modpack-admin' });
}

/** The current jar of the launcher and of the updater. */
export function useAdminModpackTools() {
  return useFetch<ModpackToolList>(TOOLS, { key: 'modpack-tools-admin' });
}

/** The retired files, with how many players still have each. */
export function useAdminModpackRetired() {
  return useFetch<ModpackRetiredList>(RETIRED, { key: 'modpack-retired-admin' });
}

/** What admins can do to the pack. Each throws a ModpackError when refused. */
export const modpackActions = {
  add: (body: ModpackAddBody) => call(() => $fetch<{ id: string }>(BASE, { method: 'POST', body })),
  edit: (id: string, body: ModpackPatchBody) =>
    call(() => $fetch(`${BASE}/${id}`, { method: 'PATCH', body })),
  pinFile: (id: string, body: ModpackPinBody) =>
    call(() => $fetch(`${BASE}/${id}/file`, { method: 'PUT', body })),
  check: () => call(() => $fetch<ModpackCheckResult>(`${BASE}/check`, { method: 'POST' })),
  adopt: (id: string) => call(() => $fetch(`${BASE}/${id}/adopt`, { method: 'POST' })),
  adoptAll: () => call(() => $fetch<{ adopted: number }>(`${BASE}/adopt-all`, { method: 'POST' })),
  exportPreview: (mode: ModpackExportMode) =>
    call(() => $fetch<ModpackExportPreview>(EXPORT, { query: { mode } })),
  exportApply: (mode: ModpackExportMode, keys: string[]) =>
    call(() => $fetch<ModpackExportResult>(EXPORT, { method: 'POST', body: { mode, keys } })),
  remove: (id: string) => call(() => $fetch(`${BASE}/${id}`, { method: 'DELETE' })),
  retire: (body: ModpackRetiredAddBody) =>
    call(() => $fetch<ModpackRetiredAddResult>(RETIRED, { method: 'POST', body })),
  editRetired: (id: string, body: ModpackRetiredPatchBody) =>
    call(() => $fetch(`${RETIRED}/${id}`, { method: 'PATCH', body })),
  removeRetired: (id: string) => call(() => $fetch(`${RETIRED}/${id}`, { method: 'DELETE' })),
  retiredPlayers: (id: string) =>
    call(() => $fetch<ModpackRetiredPlayers>(`${RETIRED}/${id}/players`)),
  publishTool: (tool: ModpackTool, body: ModpackToolBody) =>
    call(() => $fetch(`${TOOLS}/${tool}`, { method: 'PUT', body })),
};
