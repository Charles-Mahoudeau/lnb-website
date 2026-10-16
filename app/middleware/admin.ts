// The admin area, set on every page under /admin by pages/admin.vue. Pages are for site admins
// unless they set `wardenAdmins` or `eventsManagers` in definePageMeta. Others get a 404, so the
// area stays unlisted. The server checks the same roles on every admin route.
export default defineNuxtRouteMiddleware((to) => {
  const { user } = useAuth();
  const role = user.value?.role;
  const allowed =
    isAdmin(role) ||
    (to.meta.wardenAdmins === true && isWardenAdmin(role)) ||
    (to.meta.eventsManagers === true && isEventsManager(role));
  if (!allowed) {
    return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }));
  }
});

declare module '#app' {
  interface PageMeta {
    /** Set to true for an admin page that Warden admins can open too. */
    wardenAdmins?: boolean;
    /** Set to true for an admin page that events managers can open too. */
    eventsManagers?: boolean;
  }
}
