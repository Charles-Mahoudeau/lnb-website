// Sign-in is limited to an allowlist of Microsoft Entra tenants, one per school.
// Tenant IDs come from https://login.microsoftonline.com/<domain>/v2.0/.well-known/openid-configuration.
// See docs/authentication.md to add a school.
export const SCHOOLS: Readonly<Record<string, string>> = {
  '901cb4ca-b862-4029-9306-e5cd0f6d9f86': 'Epitech',
  '791f2edf-38ab-4c6c-b323-ea94dd988fde': 'e-artsup',
  '8dab9574-4b8e-4eec-8e5e-791d6835fdea': 'ISEG',
};

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

export function schoolForTenant(tid: string): string | undefined {
  return SCHOOLS[tid.toLowerCase()];
}
