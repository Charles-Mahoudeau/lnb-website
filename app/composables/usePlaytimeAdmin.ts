import type {
  PlaytimeAdminPlayer,
  PlaytimeClosureBody,
  PlaytimeClosureRow,
  PlaytimeGrantBody,
  PlaytimeLive,
  PlaytimePlayerExemptionBody,
  PlaytimePlayerOverridesBody,
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

export function usePlaytimeLive() {
  return useFetch<PlaytimeLive>(`${base}/live`, { key: 'playtime-live' });
}

export function usePlaytimePlayer(userId: string) {
  return useFetch<PlaytimeAdminPlayer>(`${base}/players/${encodeURIComponent(userId)}`, {
    key: `playtime-player-${userId}`,
  });
}

/** The writes of the player panel. Each answers with the refreshed panel. */
export function playtimePlayerActions(userId: string) {
  const url = `${base}/players/${encodeURIComponent(userId)}`;
  return {
    saveOverrides: (body: PlaytimePlayerOverridesBody) =>
      call(() => $fetch<PlaytimeAdminPlayer>(`${url}/overrides`, { method: 'PUT', body })),
    addExemption: (body: PlaytimePlayerExemptionBody) =>
      call(() => $fetch<PlaytimeAdminPlayer>(`${url}/exemptions`, { method: 'POST', body })),
    revokeExemption: (id: number) =>
      call(() =>
        $fetch<PlaytimeAdminPlayer>(`${url}/exemptions/${String(id)}`, { method: 'DELETE' }),
      ),
    addGrant: (body: PlaytimeGrantBody) =>
      call(() => $fetch<PlaytimeAdminPlayer>(`${url}/grants`, { method: 'POST', body })),
    revokeGrant: (id: number) =>
      call(() => $fetch<PlaytimeAdminPlayer>(`${url}/grants/${String(id)}`, { method: 'DELETE' })),
  };
}

export const playtimeAdminActions = {
  reset: (confirm: string) =>
    call(() => $fetch(`${base}/reset`, { method: 'POST', body: { confirm } })),
  resetAll: (confirm: string) =>
    call(() => $fetch(`${base}/reset-all`, { method: 'POST', body: { confirm } })),
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
