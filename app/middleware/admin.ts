// The admin area, set on every page under /admin by pages/admin.vue. Pages are for site admins
// unless they set `definePageMeta({ wardenAdmins: true })`. Others get a 404, so the area stays
// unlisted. The server checks the same roles on every admin route.
export default defineNuxtRouteMiddleware((to) => {
  const { user } = useAuth();
  const role = user.value?.role;
  const allowed = to.meta.wardenAdmins ? isWardenAdmin(role) : isAdmin(role);
  if (!allowed) {
    return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }));
  }
});

declare module '#app' {
  interface PageMeta {
    /** Set to true for an admin page that Warden admins can open too. */
    wardenAdmins?: boolean;
  }
}
