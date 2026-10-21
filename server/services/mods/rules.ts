import type { ModLoader } from '../../../shared/schemas/mods.ts';

// The mod list's pure rules, without database or Nuxt imports, so plain unit tests can load them.

/** What the server runs, from the mod list settings. */
export interface ServerTarget {
  gameVersion: string;
  loader: ModLoader;
}

/**
 * Whether a mod with these game versions and loaders runs on the server. Quilt loads Fabric
 * mods, so a Fabric mod runs on a Quilt server. NeoForge no longer loads Forge mods.
 */
export function isCompatible(
  mod: { gameVersions: readonly string[]; loaders: readonly string[] },
  target: ServerTarget,
): boolean {
  if (!mod.gameVersions.includes(target.gameVersion)) return false;
  const loaders = mod.loaders.map((loader) => loader.toLowerCase());
  return (
    loaders.includes(target.loader) || (target.loader === 'quilt' && loaders.includes('fabric'))
  );
}

/** CurseForge's ModLoaderType numbers. */
export const CURSEFORGE_LOADER_TYPES: Record<ModLoader, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
};

/** "Farmer's Delight" and "farmers-delight" both become "farmersdelight". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Modrinth first, then the CurseForge mods that aren't on Modrinth, matched by name or slug.
 * CurseForge is the fallback: a mod on both comes from Modrinth.
 */
export function mergeCatalogResults<T extends { name: string; slug: string }>(
  modrinth: readonly T[],
  curseforge: readonly T[],
  limit: number,
): T[] {
  const seen = new Set(
    modrinth.flatMap((hit) => [normalizeName(hit.name), normalizeName(hit.slug)]),
  );
  const extra = curseforge.filter(
    (hit) => !seen.has(normalizeName(hit.name)) && !seen.has(normalizeName(hit.slug)),
  );
  return [...modrinth, ...extra].slice(0, limit);
}

/** Slots left: suggestions in the list count, visible or removed. Never below zero. */
export function suggestionsLeft(max: number, used: number): number {
  return Math.max(0, max - used);
}

/**
 * A fixed-window limiter kept in memory, per key. The site runs as one process, so this is
 * enough without Redis. Returns whether the call is allowed.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const windows = new Map<string, { start: number; count: number }>();
  return function allow(key: string, now = Date.now()): boolean {
    const window = windows.get(key);
    if (!window || now - window.start >= windowMs) {
      // Drop old windows now and then, so the map doesn't grow forever.
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
      }
      windows.set(key, { start: now, count: 1 });
      return true;
    }
    if (window.count >= limit) return false;
    window.count++;
    return true;
  };
}

/** The hosts Modrinth and CurseForge serve mod icons from. */
const CATALOG_ICON_HOSTS = new Set(['cdn.modrinth.com', 'media.forgecdn.net']);

/**
 * Whether the site will fetch this icon for a search result. Only https and the two sources'
 * image hosts, so the icon route can't be used to fetch anything else.
 */
export function isCatalogIconUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      CATALOG_ICON_HOSTS.has(parsed.hostname) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port
    );
  } catch {
    return false;
  }
}

/** Where the page loads a search result's icon from: through the site, never from the source. */
export function catalogIconPath(url: string | null): string | null {
  return url && isCatalogIconUrl(url)
    ? `/api/minecraft/mods/catalog-icon?src=${encodeURIComponent(url)}`
    : null;
}

/** The text details of a mod that differ from what its source says now. */
export function changedDetails(
  current: { name: string; summary: string; pageUrl: string },
  project: { name: string; summary: string; pageUrl: string },
): ('name' | 'summary' | 'pageUrl')[] {
  const fields = ['name', 'summary', 'pageUrl'] as const;
  return fields.filter((field) => current[field].trim() !== project[field].trim());
}
