// Sign-in is limited to an allowlist of Microsoft Entra tenants, one per school, read from
// AUTH_ALLOWED_TENANTS. The school names are in shared/utils/schools.ts.

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
