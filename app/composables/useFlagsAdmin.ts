import type { FlagKey } from '#shared/flags';
import type { AdminFlag } from '#shared/schemas/flags';

// The Feature flags page of the admin area.

/** Every flag with its own switch and what is applied. */
export function useAdminFlags() {
  return useFetch<{ items: AdminFlag[] }>('/api/admin/flags', { key: 'admin-flags' });
}

/** Switches a flag and returns the new list. Throws when the request fails. */
export function setAdminFlag(key: FlagKey, enabled: boolean) {
  return $fetch<{ items: AdminFlag[] }>(`/api/admin/flags/${key}`, {
    method: 'PATCH',
    body: { enabled },
  });
}
