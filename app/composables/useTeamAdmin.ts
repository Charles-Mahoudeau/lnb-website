import type {
  TeamAdminView,
  TeamMemberBody,
  TeamMemberPatchBody,
  TeamPoleBody,
  TeamPolePatchBody,
  TeamProblem,
  TeamSettingsBody,
  TeamUserOption,
} from '#shared/schemas/team';
import { TEAM_PROBLEMS } from '#shared/schemas/team';

// The Team section of the admin area. Writes throw a TeamError with the API's problem.

/** A refused team request, with the reason the API gave. */
export class TeamError extends Error {
  constructor(readonly problem: TeamProblem | 'failed') {
    super(`Team request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new TeamError(
      TEAM_PROBLEMS.includes(problem as TeamProblem) ? (problem as TeamProblem) : 'failed',
    );
  }
}

/** Every pole with all its members, and the join link. */
export function useAdminTeam() {
  return useFetch<TeamAdminView>('/api/admin/team', { key: 'team-admin' });
}

/** What admins can do to the team. Each throws a TeamError when refused. */
export const teamActions = {
  addPole: (body: TeamPoleBody) =>
    call(() => $fetch<{ id: string }>('/api/admin/team/poles', { method: 'POST', body })),
  updatePole: (id: string, body: TeamPolePatchBody) =>
    call(() => $fetch(`/api/admin/team/poles/${id}`, { method: 'PATCH', body })),
  deletePole: (id: string) =>
    call(() => $fetch(`/api/admin/team/poles/${id}`, { method: 'DELETE' })),
  movePole: (id: string, direction: 'up' | 'down') =>
    call(() => $fetch(`/api/admin/team/poles/${id}/move`, { method: 'POST', body: { direction } })),
  addMember: (body: TeamMemberBody) =>
    call(() => $fetch('/api/admin/team/members', { method: 'POST', body })),
  updateMember: (userId: string, body: TeamMemberPatchBody) =>
    call(() =>
      $fetch(`/api/admin/team/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body }),
    ),
  removeMember: (userId: string) =>
    call(() =>
      $fetch(`/api/admin/team/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    ),
  moveMember: (userId: string, direction: 'up' | 'down') =>
    call(() =>
      $fetch(`/api/admin/team/members/${encodeURIComponent(userId)}/move`, {
        method: 'POST',
        body: { direction },
      }),
    ),
  setSettings: (body: TeamSettingsBody) =>
    call(() => $fetch('/api/admin/team/settings', { method: 'PATCH', body })),
  searchUsers: (q: string) =>
    call(() => $fetch<{ items: TeamUserOption[] }>('/api/admin/team/users', { query: { q } })),
};
