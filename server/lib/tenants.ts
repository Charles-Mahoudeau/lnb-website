// Sign-in is limited to an allowlist of Microsoft Entra tenants, one per school, read from
// AUTH_ALLOWED_TENANTS. The school names are in shared/utils/schools.ts.

import type { FlagKey } from '../../shared/flags.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Parses a comma-separated list of tenant IDs, as in AUTH_ALLOWED_TENANTS. Throws on anything else. */
export function parseAllowedTenants(raw: string): ReadonlySet<string> {
  const ids = raw
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  const invalid = ids.filter((id) => !UUID.test(id));
  if (invalid.length > 0) {
    throw new Error(`AUTH_ALLOWED_TENANTS has invalid tenant IDs: ${invalid.join(', ')}`);
  }
  if (ids.length === 0) {
    throw new Error('AUTH_ALLOWED_TENANTS must list at least one tenant ID');
  }
  return new Set(ids);
}

export function isAllowedTenant(tid: unknown, allowed: ReadonlySet<string>): tid is string {
  return typeof tid === 'string' && allowed.has(tid.toLowerCase());
}

/** The feature flag (shared/flags.ts) that lets each school's students sign in, by tenant ID. */
export const SCHOOL_SIGN_IN_FLAGS: Readonly<Record<string, FlagKey>> = {
  '901cb4ca-b862-4029-9306-e5cd0f6d9f86': 'signIn.epitech',
  '791f2edf-38ab-4c6c-b323-ea94dd988fde': 'signIn.eartsup',
  '8dab9574-4b8e-4eec-8e5e-791d6835fdea': 'signIn.iseg',
};
