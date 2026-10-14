// Every page needs a signed-in user unless it opts out with `definePageMeta({ auth: false })`.
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, ensureSession } = useAuth();
  // Loaded for public pages too, so the header knows who is signed in.
  await ensureSession();
  if (to.meta.auth === false || user.value) return;
  return navigateTo({ path: '/sign-in', query: { redirect: to.fullPath } });
});

declare module '#app' {
  interface PageMeta {
    /** Set to false for a page anyone can see. */
    auth?: boolean;
  }
}
