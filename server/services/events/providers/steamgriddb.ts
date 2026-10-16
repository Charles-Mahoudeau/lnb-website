import { defineCachedFunction } from 'nitropack/runtime';

import { imagesEnv } from '~~/server/lib/images-env';

import type { ImageProvider, ProviderGame, ProviderImage } from './types';

// SteamGridDB (steamgriddb.com): community art for games. Heroes are wide banners, 1920 × 620,
// the exact shape of an event banner. Grids are the store covers, narrower. NSFW, humor and
// epilepsy-warning art is left out. Searches go through the site and are cached for an hour.

const BASE = 'https://www.steamgriddb.com/api/v2';
const TIMEOUT_MS = 8000;
/** The hosts SteamGridDB serves images from, the only ones the import fetches for it. */
export const STEAMGRIDDB_HOSTS = new Set(['cdn2.steamgriddb.com']);

export class ProviderUnavailableError extends Error {}

async function get<T>(path: string): Promise<T> {
  const key = imagesEnv().STEAMGRIDDB_API_KEY;
  if (!key) throw new ProviderUnavailableError('No STEAMGRIDDB_API_KEY');
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ProviderUnavailableError(path);
  }
  if (response.status === 404) return { success: true, data: [] } as T;
  if (!response.ok) throw new ProviderUnavailableError(`${path}: ${String(response.status)}`);
  return (await response.json()) as T;
}

interface Answer<T> {
  success: boolean;
  data: T[];
}

const searchGames = defineCachedFunction(
  async (term: string): Promise<ProviderGame[]> => {
    const answer = await get<Answer<{ id: number; name: string; release_date?: number }>>(
      `/search/autocomplete/${encodeURIComponent(term)}`,
    );
    return answer.data.slice(0, 8).map((game) => ({
      id: String(game.id),
      name: game.name,
      year: game.release_date ? new Date(game.release_date * 1000).getUTCFullYear() : null,
    }));
  },
  { name: 'steamgriddb-search', maxAge: 60 * 60, getKey: (term: string) => term.toLowerCase() },
);

const DIMENSIONS = { banners: '1920x620,3840x1240', covers: '920x430,460x215' } as const;
const PATHS = { banners: 'heroes', covers: 'grids' } as const;

const listImages = defineCachedFunction(
  async (gameId: string, kind: 'banners' | 'covers'): Promise<ProviderImage[]> => {
    const query = new URLSearchParams({
      dimensions: DIMENSIONS[kind],
      types: 'static',
      nsfw: 'false',
      humor: 'false',
      epilepsy: 'false',
    });
    const answer = await get<
      Answer<{
        url: string;
        thumb: string;
        width: number;
        height: number;
        author?: { name?: string };
      }>
    >(`/${PATHS[kind]}/game/${encodeURIComponent(gameId)}?${query.toString()}`);
    return answer.data
      .filter((image) => {
        try {
          return STEAMGRIDDB_HOSTS.has(new URL(image.url).host);
        } catch {
          return false;
        }
      })
      .slice(0, 24)
      .map((image) => ({
        url: image.url,
        thumb: image.thumb,
        width: image.width,
        height: image.height,
        author: image.author?.name ?? null,
      }));
  },
  {
    name: 'steamgriddb-images',
    maxAge: 60 * 60,
    getKey: (gameId: string, kind: string) => `${gameId}-${kind}`,
  },
);

export const steamGridDb: ImageProvider = {
  available: () => !!imagesEnv().STEAMGRIDDB_API_KEY,
  searchGames,
  listImages,
  hosts: STEAMGRIDDB_HOSTS,
};
