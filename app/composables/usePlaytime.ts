import type { PlaytimeMe } from '#shared/schemas/playtime';

/**
 * The signed-in player's week for the Minecraft account page (GET /api/playtime/me). A 404 means
 * the player has no linked account, and the flag being off is a 404 too: the card hides itself.
 * Refetches every 30 seconds while the page is open, so the band follows the clock.
 */
export function usePlaytime(options: { immediate?: boolean } = {}) {
  const result = useFetch<PlaytimeMe | null>('/api/playtime/me', {
    key: 'playtime-me',
    immediate: options.immediate ?? true,
    // The page must work without it: a missing or failing card only hides the card.
    default: () => null,
  });
  onMounted(() => {
    const timer = setInterval(() => void result.refresh(), 30_000);
    onScopeDispose(() => {
      clearInterval(timer);
    });
  });
  return result;
}
