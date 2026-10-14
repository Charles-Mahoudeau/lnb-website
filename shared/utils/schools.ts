// Schools whose students can sign in, by Microsoft Entra tenant ID.
// Tenant IDs come from https://login.microsoftonline.com/<domain>/v2.0/.well-known/openid-configuration.
// Which ones are allowed is set by AUTH_ALLOWED_TENANTS. See docs/authentication.md to add a school.
export const SCHOOLS: Readonly<Record<string, string>> = {
  '901cb4ca-b862-4029-9306-e5cd0f6d9f86': 'Epitech',
  '791f2edf-38ab-4c6c-b323-ea94dd988fde': 'e-artsup',
  '8dab9574-4b8e-4eec-8e5e-791d6835fdea': 'ISEG',
};

export function schoolForTenant(tid: string): string | undefined {
  return SCHOOLS[tid.toLowerCase()];
}
