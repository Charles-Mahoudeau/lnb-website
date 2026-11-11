import type {
  EventPlayerOptions,
  EventTeamCreateBody,
  EventTeamPatchBody,
  EventTeamsView,
} from '#shared/schemas/event-teams';

// The teams of a tournament, as players see them. See docs/tournaments.md.

/** The teams of an event, the players looking for one, and what the caller can do. */
export function useEventTeams(id: MaybeRefOrGetter<string>, enabled = true) {
  return useFetch<EventTeamsView>(() => `/api/events/${toValue(id)}/teams`, {
    key: computed(() => `event-teams-${toValue(id)}`),
    immediate: enabled,
  });
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw toEventError(error);
  }
}

/** Team actions. Each throws an EventError when refused. */
export const eventTeamActions = {
  create: (id: string, body: EventTeamCreateBody) =>
    call(() => $fetch<{ id: string }>(`/api/events/${id}/teams`, { method: 'POST', body })),
  update: (id: string, teamId: string, body: EventTeamPatchBody) =>
    call(() => $fetch(`/api/events/${id}/teams/${teamId}`, { method: 'PATCH', body })),
  disband: (id: string, teamId: string) =>
    call(() => $fetch(`/api/events/${id}/teams/${teamId}`, { method: 'DELETE' })),
  leave: (id: string, teamId: string) =>
    call(() => $fetch(`/api/events/${id}/teams/${teamId}/leave`, { method: 'POST' })),
  kick: (id: string, teamId: string, userId: string) =>
    call(() =>
      $fetch(`/api/events/${id}/teams/${teamId}/members/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      }),
    ),
  transfer: (id: string, teamId: string, userId: string) =>
    call(() =>
      $fetch(`/api/events/${id}/teams/${teamId}/captain`, { method: 'POST', body: { userId } }),
    ),
  setLookingHidden: (id: string, hidden: boolean) =>
    call(() => $fetch(`/api/events/${id}/looking`, { method: 'PATCH', body: { hidden } })),
};

/** Invitations and requests. Each throws an EventError when refused. */
export const eventInviteActions = {
  search: (id: string, q: string, teamId?: string) =>
    call(() =>
      $fetch<EventPlayerOptions>(`/api/events/${id}/team-players`, { query: { q, teamId } }),
    ),
  invite: (id: string, teamId: string, userId: string) =>
    call(() =>
      $fetch(`/api/events/${id}/teams/${teamId}/invites`, { method: 'POST', body: { userId } }),
    ),
  request: (id: string, teamId: string) =>
    call(() => $fetch(`/api/events/${id}/teams/${teamId}/requests`, { method: 'POST' })),
  answer: (id: string, inviteId: number, accept: boolean) =>
    call(() =>
      $fetch(`/api/events/${id}/invites/${String(inviteId)}`, { method: 'POST', body: { accept } }),
    ),
  cancel: (id: string, inviteId: number) =>
    call(() => $fetch(`/api/events/${id}/invites/${String(inviteId)}`, { method: 'DELETE' })),
};
