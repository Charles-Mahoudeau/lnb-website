import type { TeamMeView, TeamPublicView } from '#shared/schemas/team';

// The team page (/team) and the account's switch for it. The admin side is in useTeamAdmin.

/** The poles and members that show publicly, and the join link when it's on. */
export function usePublicTeam() {
  return useFetch<TeamPublicView>('/api/team', { key: 'team' });
}

/** Whether the signed-in account is on the team page, and whether it chose to show. */
export function useMyTeam(enabled: boolean) {
  return useFetch<TeamMeView>('/api/team/me', { key: 'team-me', immediate: enabled });
}

export function setShowOnTeam(showSelf: boolean) {
  return $fetch<TeamMeView>('/api/team/me', { method: 'PATCH', body: { showSelf } });
}
