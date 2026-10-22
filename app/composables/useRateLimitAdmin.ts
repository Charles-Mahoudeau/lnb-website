import type { RateLimitMode } from '#shared/rate-limit';
import type { AdminRateLimit } from '#shared/schemas/rate-limit';

// The Rate limiting page of the admin area.

/** The current mode, who set it and when. */
export function useAdminRateLimit() {
  return useFetch<AdminRateLimit>('/api/admin/rate-limit', { key: 'admin-rate-limit' });
}

/** Sets the mode and returns the new state. Throws when the request fails. */
export function setAdminRateLimit(mode: RateLimitMode) {
  return $fetch<AdminRateLimit>('/api/admin/rate-limit', { method: 'PUT', body: { mode } });
}
