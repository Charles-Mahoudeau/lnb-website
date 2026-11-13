// Error codes the sign-in callback puts in `?error=` on the sign-in page.
export const TENANT_NOT_ALLOWED = 'tenant_not_allowed';
/** The email already belongs to an account that isn't a ghost, or to a ghost of another school. */
export const ACCOUNT_CLAIM_REFUSED = 'account_claim_refused';
/** Sign-in is switched off by a feature flag, for everyone or for the visitor's school. */
export const SIGN_IN_DISABLED = 'sign_in_disabled';
