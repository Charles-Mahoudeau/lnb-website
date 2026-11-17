// This file has no project imports on purpose: the unit test loads it directly.
// The loader's newest version for a game version, from the loader's own metadata. The manifest
// uses it while the admin hasn't set one in the Mods settings. See docs/modpack.md.

const TTL = 60 * 60 * 1000;
const FAILED_TTL = 5 * 60 * 1000;
const TIMEOUT = 5000;

const cache = new Map<string, { value: string; expires: number }>();

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error(`${url}: ${String(response.status)}`);
  return (await response.json()) as T;
}

/** NeoForge numbers by game version without the leading "1.": 1.21.1 is 21.1.x, 26.1 is 26.1.x. */
export function neoforgeVersion(versions: readonly string[], gameVersion: string): string {
  const prefix = `${gameVersion.replace(/^1\./, '')}.`;
  const matching = versions.filter((version) => version.startsWith(prefix));
  const stable = matching.filter((version) => !version.includes('-'));
  return (stable.length ? stable : matching).at(-1) ?? '';
}

async function lookup(loader: string, gameVersion: string): Promise<string> {
  switch (loader) {
    case 'neoforge': {
      const body = await json<{ versions: string[] }>(
        'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge',
      );
      return neoforgeVersion(body.versions, gameVersion);
    }
    case 'fabric': {
      const body = await json<{ version: string; stable: boolean }[]>(
        'https://meta.fabricmc.net/v2/versions/loader',
      );
      return body.find((entry) => entry.stable)?.version ?? '';
    }
    case 'quilt': {
      const body = await json<{ version: string }[]>('https://meta.quiltmc.org/v3/versions/loader');
      return (body.find((entry) => !entry.version.includes('-')) ?? body[0])?.version ?? '';
    }
    case 'forge': {
      const body = await json<{ promos: Record<string, string> }>(
        'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
      );
      return body.promos[`${gameVersion}-latest`] ?? '';
    }
    default:
      return '';
  }
}

/** The newest version, or '' when it can't be found. Cached, and never throws. */
export async function latestLoaderVersion(loader: string, gameVersion: string): Promise<string> {
  const key = `${loader}:${gameVersion}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  try {
    const value = await lookup(loader, gameVersion);
    cache.set(key, { value, expires: Date.now() + (value ? TTL : FAILED_TTL) });
    return value;
  } catch (error) {
    console.warn('Loader version lookup failed', error);
    // Keep serving the last good value if there was one.
    cache.set(key, { value: hit?.value ?? '', expires: Date.now() + FAILED_TTL });
    return hit?.value ?? '';
  }
}
