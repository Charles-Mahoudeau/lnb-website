import type { AdminTeamPatchBody, AdminTeamsView } from '#shared/schemas/event-teams';

// The Teams tab of an event in the admin area. Writes throw an EventError.

/** The teams of a tournament with emails, and the registered players in no team. */
export function useAdminTeams(id: string) {
  return useFetch<AdminTeamsView>(`/api/admin/events/${id}/teams`, {
    key: `event-admin-teams-${id}`,
  });
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw toEventError(error);
  }
}

const base = (id: string) => `/api/admin/events/${id}/teams`;

export const adminTeamActions = {
  create: (id: string, body: { name: string; userId: string; captain: boolean }) =>
    call(() => $fetch<{ id: string }>(base(id), { method: 'POST', body })),
  update: (id: string, teamId: string, body: AdminTeamPatchBody) =>
    call(() => $fetch(`${base(id)}/${teamId}`, { method: 'PATCH', body })),
  remove: (id: string, teamId: string) =>
    call(() => $fetch(`${base(id)}/${teamId}`, { method: 'DELETE' })),
  addMember: (id: string, teamId: string, body: { userId: string; force: boolean }) =>
    call(() => $fetch(`${base(id)}/${teamId}/members`, { method: 'POST', body })),
  removeMember: (id: string, teamId: string, userId: string) =>
    call(() =>
      $fetch(`${base(id)}/${teamId}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    ),
};
