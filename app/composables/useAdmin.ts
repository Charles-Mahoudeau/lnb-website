import { ADMIN_PROBLEMS } from '#shared/schemas/admin';
import type {
  AdminBanBody,
  AdminOverview,
  AdminProblem,
  AdminRolesBody,
  AdminUserPage,
  AdminUsersQuery,
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

/** What needs an admin, and the latest changes. */
export function useAdminOverview() {
  return useFetch<AdminOverview>('/api/admin/overview', { key: 'admin-overview' });
}

/** Accounts for the list, refetched when the query changes. */
export function useAdminUsers(query: Ref<AdminUsersQuery>) {
  return useFetch<AdminUserPage>('/api/admin/users', { key: 'admin-users', query });
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
  };
}
