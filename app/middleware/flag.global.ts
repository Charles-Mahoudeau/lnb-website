import type { FlagKey } from '#shared/flags';

// Loads the feature flags before every page, and shows a 503 for a page whose feature is off.
export default defineNuxtRouteMiddleware(async (to) => {
  const { isEnabled, ensureFlags } = useFlags();
  await ensureFlags();
  if (to.meta.flag && !isEnabled(to.meta.flag)) {
    return abortNavigation(
      createError({ statusCode: 503, statusMessage: 'Temporarily unavailable', fatal: true }),
    );
  }
});

declare module '#app' {
  interface PageMeta {
    /** The feature flag this page needs. The page shows a 503 while it's off. */
    flag?: FlagKey;
  }
}
