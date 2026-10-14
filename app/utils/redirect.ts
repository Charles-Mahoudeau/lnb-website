/**
 * The path to go back to after signing in, from a `?redirect=` query value.
 * Only same-site paths are kept, so the sign-in page can't be used to send people elsewhere.
 */
export function safeRedirect(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return fallback;
  // `//host` and `/\host` are read by browsers as another site.
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
