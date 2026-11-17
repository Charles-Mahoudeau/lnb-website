import type {
  PlaytimeClosureBody,
  PlaytimeClosureRow,
  PlaytimeSchoolBody,
  PlaytimeSettingsPatch,
  PlaytimeSettingsResponse,
} from '#shared/schemas/playtime';

// The playtime section of the admin area (/admin/warden/playtime). Reads use useFetch with
// explicit keys, writes throw a PlaytimeAdminError with the API's problem. Every write answers
// with the data the screen shows, so callers can put it straight into their ref.

export type PlaytimeAdminProblem = 'notFound' | 'eventClosure' | 'failed';

/** A refused playtime admin request, with the reason the API gave. */
export class PlaytimeAdminError extends Error {
  constructor(readonly problem: PlaytimeAdminProblem) {
    super(`Playtime admin request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new PlaytimeAdminError(
      problem === 'notFound' || problem === 'eventClosure' ? problem : 'failed',
    );
  }
}

const base = '/api/playtime/admin';

export function usePlaytimeSettings() {
  return useFetch<PlaytimeSettingsResponse>(`${base}/settings`, { key: 'playtime-settings' });
}

export function usePlaytimeClosures() {
  return useFetch<PlaytimeClosureRow[]>(`${base}/closures`, { key: 'playtime-closures' });
}

export const playtimeAdminActions = {
  saveSettings: (body: PlaytimeSettingsPatch) =>
    call(() => $fetch<PlaytimeSettingsResponse>(`${base}/settings`, { method: 'PATCH', body })),
  saveSchool: (tenantId: string, body: PlaytimeSchoolBody) =>
    call(() =>
      $fetch<PlaytimeSettingsResponse>(`${base}/schools/${tenantId}`, { method: 'PUT', body }),
    ),
  clearSchool: (tenantId: string) =>
    call(() =>
      $fetch<PlaytimeSettingsResponse>(`${base}/schools/${tenantId}`, { method: 'DELETE' }),
    ),
  addClosure: (body: PlaytimeClosureBody) =>
    call(() => $fetch<PlaytimeClosureRow[]>(`${base}/closures`, { method: 'POST', body })),
  skipWeek: () =>
    call(() => $fetch<PlaytimeClosureRow[]>(`${base}/closures/skip-week`, { method: 'POST' })),
  deleteClosure: (id: number) =>
    call(() =>
      $fetch<PlaytimeClosureRow[]>(`${base}/closures/${String(id)}`, { method: 'DELETE' }),
    ),
};
