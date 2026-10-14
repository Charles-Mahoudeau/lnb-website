import { adminClient, inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/vue';

function createClient() {
  return createAuthClient({
    plugins: [
      adminClient(),
      // Mirrors user.additionalFields in server/lib/auth.ts.
      inferAdditionalFields({
        user: {
          tenantId: { type: 'string' },
          lastSignInAt: { type: 'date', required: false },
        },
      }),
    ],
  });
}

export type AuthSession = ReturnType<typeof createClient>['$Infer']['Session'];

// Created on first use, in the browser only: it takes the API origin from the page.
let client: ReturnType<typeof createClient> | undefined;
function authClient() {
  return (client ??= createClient());
}

export function useAuth() {
  const session = useState<AuthSession | null>('auth-session', () => null);
  const loaded = useState('auth-session-loaded', () => false);
  // Forwards the visitor's cookies when this runs during server rendering.
  const requestFetch = useRequestFetch();

  const user = computed(() => session.value?.user ?? null);
  const school = computed(() => (user.value ? schoolForTenant(user.value.tenantId) : undefined));

  async function fetchSession() {
    try {
      session.value = await requestFetch<AuthSession | null>('/api/auth/get-session');
      loaded.value = true;
    } catch (error) {
      // Public pages still render if auth is down. Protected pages send people to sign in.
      console.error('Unable to load the session', error);
      session.value = null;
    }
  }

  /** Loads the session once per visit. The global middleware calls it before every page. */
  async function ensureSession() {
    if (!loaded.value) await fetchSession();
  }

  /** Leaves for Microsoft. Comes back to `redirect`, or to the sign-in page with `?error=`. */
  async function signIn(redirect: string) {
    const { error } = await authClient().signIn.social({
      provider: 'microsoft',
      callbackURL: redirect,
      errorCallbackURL: '/sign-in',
    });
    if (error) throw new Error(error.message ?? 'Sign-in failed');
  }

  async function signOut() {
    await authClient().signOut();
    session.value = null;
    await navigateTo('/');
  }

  return { session, user, school, ensureSession, fetchSession, signIn, signOut };
}
