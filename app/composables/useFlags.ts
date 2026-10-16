import type { FlagKey } from '#shared/flags';

// The feature flags (shared/flags.ts), as the server applies them. Only for what the page shows:
// the routes check the flags themselves, so a stale value here can't let anything through.

const REFRESH_AFTER_MS = 30_000;

export function useFlags() {
  const states = useState<Partial<Record<FlagKey, boolean>>>('flags', () => ({}));
  const loadedAt = useState('flags-loaded-at', () => 0);
  // Forwards the visitor's cookies when this runs during server rendering.
  const requestFetch = useRequestFetch();

  /** Loads the flags, again after 30 seconds. The global middleware calls it before every page. */
  async function ensureFlags() {
    if (Date.now() - loadedAt.value < REFRESH_AFTER_MS) return;
    try {
      states.value = await requestFetch<Record<FlagKey, boolean>>('/api/flags');
      loadedAt.value = Date.now();
    } catch (error) {
      // Pages still render if the flags can't load: everything shows, and the server refuses
      // what is off.
      console.error('Unable to load the feature flags', error);
    }
  }

  /** Whether a feature is on. Everything is on until the flags are loaded. */
  const isEnabled = (key: FlagKey) => states.value[key] !== false;

  return { states, isEnabled, ensureFlags };
}
