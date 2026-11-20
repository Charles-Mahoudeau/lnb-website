import { ADMIN_PROBLEMS } from '#shared/schemas/admin';
import type {
  AdminActivityPage,
  AdminBanBody,
  AdminGhost,
  AdminGhostBody,
  AdminGhostUpdateBody,
  AdminBulkBody,
  AdminBulkResult,
  AdminInbox,
  AdminProblem,
  AdminRolesBody,
  AdminPeoplePage,
  AdminPeopleQuery,
  AdminPersonSummary,
  AdminWeek,
} from '#shared/schemas/admin';

// The admin area's data and actions (/api/admin). Writes throw an AdminError with the API's
// problem. Warden's sections use useWardenAdmin instead.

export class AdminError extends Error {
  constructor(readonly problem: AdminProblem | 'failed') {
    super(`Admin request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new AdminError(
      ADMIN_PROBLEMS.includes(problem as AdminProblem) ? (problem as AdminProblem) : 'failed',
    );
  }
}

/**
 * What is waiting for the caller's roles. The Home rows and the sidebar badges share this one
 * fetch (same key), loaded on the client and refreshed on each admin navigation.
 */
export function useAdminInbox() {
  return useFetch<AdminInbox>('/api/admin/inbox', {
    key: 'admin-inbox',
    lazy: true,
    server: false,
  });
}

/** One page of People, refetched when the query changes. */
export function useAdminPeople(query: Ref<AdminPeopleQuery>) {
  return useFetch<AdminPeoplePage>('/api/admin/people', { key: 'admin-people', query });
}

/** The Summary tab of the Person page, cut to the caller's role. */
export function useAdminPersonSummary(userId: string) {
  return useFetch<AdminPersonSummary>(`/api/admin/people/${encodeURIComponent(userId)}/summary`, {
    key: `admin-person-${userId}`,
  });
}

/**
 * A ghost made by an events manager, from the events pickers. Throws an AdminError, like the
 * admin's own route (`createGhost` below), which the Users and Team screens use.
 */
export function createEventGhost(body: AdminGhostBody) {
  return call(() => $fetch<AdminGhost>('/api/admin/events/users/ghost', { method: 'POST', body }));
}

/** Everything an admin can do to an account. */
export function useAdminUserActions() {
  const base = (userId: string) => `/api/admin/users/${encodeURIComponent(userId)}`;
  return {
    setRoles: (userId: string, roles: AdminRolesBody) =>
      call(() => $fetch(`${base(userId)}/roles`, { method: 'PUT', body: roles })),
    ban: (userId: string, body: AdminBanBody) =>
      call(() => $fetch(`${base(userId)}/ban`, { method: 'POST', body })),
    unban: (userId: string) => call(() => $fetch(`${base(userId)}/unban`, { method: 'POST' })),
    signOut: (userId: string) => call(() => $fetch(`${base(userId)}/sign-out`, { method: 'POST' })),
    remove: (userId: string) => call(() => $fetch(base(userId), { method: 'DELETE' })),
    /** Changes a ghost's name, email or school. */
    updateGhost: (userId: string, body: AdminGhostUpdateBody) =>
      call(() => $fetch<AdminGhost>(`${base(userId)}/ghost`, { method: 'PATCH', body })),
    /** An account for someone who has not signed in yet. */
    createGhost: (body: AdminGhostBody) =>
      call(() => $fetch<AdminGhost>('/api/admin/users/ghost', { method: 'POST', body })),
    /** One action on many accounts. With `dryRun`, counts who it would apply to. */
    bulk: (body: AdminBulkBody) =>
      call(() => $fetch<AdminBulkResult>('/api/admin/users/bulk', { method: 'POST', body })),
  };
}

/** The strip of figures on Home, cut to the caller's roles. Loaded on the client like the inbox. */
export function useAdminWeek() {
  return useFetch<AdminWeek>('/api/admin/week', {
    key: 'admin-week',
    lazy: true,
    server: false,
  });
}

/** The latest entries of the activity log, for Home. Each role reads its own areas. */
export function useAdminRecentActivity() {
  return useFetch<AdminActivityPage>('/api/admin/activity', {
    key: 'admin-recent-activity',
    lazy: true,
    server: false,
  });
}
