import type { GamesplanetPublicView } from '#shared/schemas/gamesplanet';

// The Gamesplanet deals shown on the partners page. The admin side is in useGamesplanetAdmin.

/**
 * The deals. The route answers 404 while the `gamesplanet` flag is off, which is not an error
 * worth showing: the data is then null and the band stays out.
 */
export function usePublicGamesplanet() {
  const { isEnabled } = useFlags();
  return useFetch<GamesplanetPublicView | null>('/api/gamesplanet', {
    key: 'gamesplanet',
    // A failed or refused read leaves the band out: it is never a reason to break the page.
    default: () => null,
    onResponseError: () => undefined,
    // Nothing to ask while the flag is off.
    immediate: isEnabled('gamesplanet'),
  });
}
