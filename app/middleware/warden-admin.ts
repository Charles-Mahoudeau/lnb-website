// Pages for Warden admins (and site admins). Others get a 404, so the panel stays unlisted.
export default defineNuxtRouteMiddleware(() => {
  const { user } = useAuth();
  if (!user.value || !isWardenAdmin(user.value.role)) {
    return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }));
  }
});
