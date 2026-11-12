import type {
  AnticheatAlertRow,
  AnticheatBulkBody,
  AnticheatBulkResult,
  AnticheatDecisionBody,
  AnticheatDecisionResult,
  AnticheatFileDetail,
  AnticheatFilePlayerRow,
  AnticheatFileRow,
  AnticheatFilesQuery,
  AnticheatModIdBanRow,
  AnticheatPlayerDetail,
  AnticheatPlayerRow,
  AnticheatPlayersQuery,
  AnticheatProblem,
  AnticheatProjectCreateBody,
  AnticheatProjectDetail,
  AnticheatSettings,
  AnticheatSettingsPatch,
  AnticheatSummary,
  AnticheatTimelineEvent,
} from '#shared/schemas/anticheat';
import { ANTICHEAT_PROBLEMS } from '#shared/schemas/anticheat';

// The anticheat section of the admin area. Reads use useFetch with explicit keys, writes throw an
// AnticheatError with the API's problem.

/** A refused anticheat request, with the reason the API gave. */
export class AnticheatError extends Error {
  constructor(readonly problem: AnticheatProblem | 'failed') {
    super(`Anticheat request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new AnticheatError(
      ANTICHEAT_PROBLEMS.includes(problem as AnticheatProblem)
        ? (problem as AnticheatProblem)
        : 'failed',
    );
  }
}

const base = '/api/anticheat/admin';

/** Counts for the nav badge. Only fetched for Warden admins, on the client. */
export function useAnticheatSummary() {
  return useFetch<AnticheatSummary>(`${base}/summary`, {
    key: 'anticheat-summary',
    lazy: true,
    server: false,
  });
}

/** One page of the file registry. The first page is a `useFetch`; more pages come by cursor. */
export function useAnticheatFiles(query: Ref<Omit<AnticheatFilesQuery, 'cursor'>>) {
  return useFetch<{ items: AnticheatFileRow[]; nextCursor: string | null }>(`${base}/files`, {
    key: 'anticheat-files',
    query,
  });
}

export function useAnticheatFile(sha512: string) {
  return useFetch<AnticheatFileDetail>(`${base}/files/${sha512}`, {
    key: `anticheat-file-${sha512}`,
  });
}

export function useAnticheatProject(id: string) {
  return useFetch<AnticheatProjectDetail>(`${base}/projects/${id}`, {
    key: `anticheat-project-${id}`,
  });
}

type Page<T> = { items: T[]; nextCursor: string | null };

/** One page of players. More pages come by cursor. */
export function useAnticheatPlayers(query: Ref<Omit<AnticheatPlayersQuery, 'cursor'>>) {
  return useFetch<Page<AnticheatPlayerRow>>(`${base}/players`, {
    key: 'anticheat-players',
    query,
  });
}

/** One player's anticheat panel. Loaded on the client, so the Warden page keeps one request. */
export function useAnticheatPlayer(userId: string) {
  return useFetch<AnticheatPlayerDetail>(`${base}/players/${encodeURIComponent(userId)}`, {
    key: `anticheat-player-${userId}`,
    lazy: true,
    server: false,
  });
}

export function useAnticheatSettings() {
  return useFetch<AnticheatSettings>(`${base}/settings`, { key: 'anticheat-settings' });
}

export function useAnticheatModIdBans() {
  return useFetch<AnticheatModIdBanRow[]>(`${base}/mod-id-bans`, { key: 'anticheat-mod-id-bans' });
}

/** The open alerts, with a first page for the top of the review queue. */
export function useAnticheatAlerts() {
  return useFetch<Page<AnticheatAlertRow>>(`${base}/alerts`, {
    key: 'anticheat-alerts',
    lazy: true,
    server: false,
  });
}

/** What admins can do to files and projects. Each throws an AnticheatError when refused. */
export const anticheatActions = {
  moreFiles: (query: Omit<AnticheatFilesQuery, 'cursor'>, cursor: string) =>
    call(() =>
      $fetch<{ items: AnticheatFileRow[]; nextCursor: string | null }>(`${base}/files`, {
        query: { ...query, cursor },
      }),
    ),
  morePlayers: (sha512: string, cursor: string, project: boolean) =>
    call(() =>
      $fetch<{ items: AnticheatFilePlayerRow[]; nextCursor: string | null }>(
        `${base}/files/${sha512}/players`,
        { query: { cursor, project: project ? '1' : undefined } },
      ),
    ),
  decideFile: (sha512: string, body: AnticheatDecisionBody) =>
    call(() => $fetch(`${base}/files/${sha512}/decision`, { method: 'POST', body })),
  decideProject: (id: string, body: AnticheatDecisionBody) =>
    call(() =>
      $fetch<AnticheatDecisionResult>(`${base}/projects/${id}/decision`, {
        method: 'POST',
        body,
      }),
    ),
  createProject: (body: AnticheatProjectCreateBody) =>
    call(() => $fetch<{ id: string }>(`${base}/projects`, { method: 'POST', body })),
  reviewed: (sha512: string) =>
    call(() => $fetch(`${base}/files/${sha512}/reviewed`, { method: 'POST' })),
  note: (sha512: string, body: string) =>
    call(() => $fetch(`${base}/files/${sha512}/notes`, { method: 'POST', body: { body } })),
  rescore: (sha512: string) =>
    call(() => $fetch(`${base}/files/${sha512}/rescore`, { method: 'POST' })),
  bulk: (sha512: string, body: AnticheatBulkBody) =>
    call(() =>
      $fetch<AnticheatBulkResult>(`${base}/files/${sha512}/players/bulk`, {
        method: 'POST',
        body,
      }),
    ),
  morePlayerRows: (query: Omit<AnticheatPlayersQuery, 'cursor'>, cursor: string) =>
    call(() =>
      $fetch<Page<AnticheatPlayerRow>>(`${base}/players`, { query: { ...query, cursor } }),
    ),
  moreEvents: (userId: string, cursor: string) =>
    call(() =>
      $fetch<Page<AnticheatTimelineEvent>>(`${base}/players/${encodeURIComponent(userId)}/events`, {
        query: { cursor },
      }),
    ),
  setHold: (userId: string, body: { hold: boolean; reason: string }) =>
    call(() =>
      $fetch(`${base}/players/${encodeURIComponent(userId)}/hold`, { method: 'POST', body }),
    ),
  setScore: (userId: string, body: { score: number; reason: string }) =>
    call(() =>
      $fetch(`${base}/players/${encodeURIComponent(userId)}/score`, { method: 'POST', body }),
    ),
  saveSettings: (body: AnticheatSettingsPatch) =>
    call(() => $fetch<AnticheatSettings>(`${base}/settings`, { method: 'PATCH', body })),
  rescoreAll: () => call(() => $fetch<{ files: number }>(`${base}/rescore`, { method: 'POST' })),
  banModId: (body: { modId: string; reason: string }) =>
    call(() => $fetch<AnticheatModIdBanRow[]>(`${base}/mod-id-bans`, { method: 'POST', body })),
  unbanModId: (modId: string) =>
    call(() => $fetch(`${base}/mod-id-bans/${encodeURIComponent(modId)}`, { method: 'DELETE' })),
  dismissAlert: (id: number) =>
    call(() => $fetch(`${base}/alerts/${String(id)}/dismiss`, { method: 'POST' })),
  moreAlerts: (cursor: string) =>
    call(() => $fetch<Page<AnticheatAlertRow>>(`${base}/alerts`, { query: { cursor } })),
};
