import { defineCachedFunction } from 'nitropack/runtime';

import { modsEnv } from '~~/server/lib/mods-env';

import { CURSEFORGE_LOADER_TYPES, isCompatible, mergeCatalogResults } from './rules';
import type { ServerTarget } from './rules';

import type { ModCatalogSource } from '#shared/schemas/mods';

// Modrinth and CurseForge, called by the site only: visitors never contact them, and the
// CurseForge key never leaves the server. Search results are cached for an hour.

const MODRINTH = 'https://api.modrinth.com/v2';
const CURSEFORGE = 'https://api.curseforge.com/v1';
const MINECRAFT_GAME_ID = 432;
const MOD_CLASS_ID = 6;
const TIMEOUT_MS = 5000;
const PAGE_SIZE = 10;
const RESULT_LIMIT = 12;

/** A project from either source, with what the site keeps and shows. */
export interface CatalogProject {
  source: ModCatalogSource;
  sourceId: string;
  slug: string;
  name: string;
  summary: string;
  author: string;
  downloads: number;
  pageUrl: string;
  iconUrl: string | null;
  compatible: boolean;
}

/** Thrown when a source can't be reached or answers with an error. */
export class CatalogUnavailableError extends Error {}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T | undefined> {
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new CatalogUnavailableError(url);
  }
  if (response.status === 404) return undefined;
  if (!response.ok) throw new CatalogUnavailableError(`${url}: ${String(response.status)}`);
  return (await response.json()) as T;
}

// Modrinth

function modrinthHeaders() {
  return { 'User-Agent': modsEnv().MODRINTH_USER_AGENT };
}

interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  icon_url: string | null;
  categories: string[];
  versions: string[];
}

interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  downloads: number;
  icon_url: string | null;
  project_type: string;
  game_versions: string[];
  loaders: string[];
}

async function modrinthSearch(query: string, target: ServerTarget): Promise<CatalogProject[]> {
  const params = new URLSearchParams({
    query,
    limit: String(PAGE_SIZE),
    facets: JSON.stringify([['project_type:mod']]),
  });
  const body = await getJson<{ hits: ModrinthHit[] }>(
    `${MODRINTH}/search?${params.toString()}`,
    modrinthHeaders(),
  );
  return (body?.hits ?? []).map((hit) => ({
    source: 'modrinth',
    sourceId: hit.project_id,
    slug: hit.slug,
    name: hit.title,
    summary: hit.description,
    author: hit.author,
    downloads: hit.downloads,
    pageUrl: `https://modrinth.com/mod/${hit.slug}`,
    iconUrl: hit.icon_url || null,
    // Search hits list loaders among their categories.
    compatible: isCompatible({ gameVersions: hit.versions, loaders: hit.categories }, target),
  }));
}

async function modrinthProject(
  id: string,
  target: ServerTarget,
): Promise<CatalogProject | undefined> {
  const project = await getJson<ModrinthProject>(
    `${MODRINTH}/project/${encodeURIComponent(id)}`,
    modrinthHeaders(),
  );
  if (!project || project.project_type !== 'mod') return undefined;
  return {
    source: 'modrinth',
    sourceId: project.id,
    slug: project.slug,
    name: project.title,
    summary: project.description,
    author: '',
    downloads: project.downloads,
    pageUrl: `https://modrinth.com/mod/${project.slug}`,
    iconUrl: project.icon_url || null,
    compatible: isCompatible(
      { gameVersions: project.game_versions, loaders: project.loaders },
      target,
    ),
  };
}

// CurseForge

function curseforgeHeaders(key: string) {
  return { 'x-api-key': key, Accept: 'application/json' };
}

interface CurseforgeMod {
  id: number;
  gameId: number;
  classId: number;
  slug: string;
  name: string;
  summary: string;
  downloadCount: number;
  authors: { name: string }[];
  links: { websiteUrl: string };
  logo: { thumbnailUrl: string; url: string } | null;
}

function fromCurseforge(mod: CurseforgeMod, compatible: boolean): CatalogProject {
  return {
    source: 'curseforge',
    sourceId: String(mod.id),
    slug: mod.slug,
    name: mod.name,
    summary: mod.summary,
    author: mod.authors[0]?.name ?? '',
    downloads: mod.downloadCount,
    pageUrl: mod.links.websiteUrl || `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}`,
    iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || null,
    compatible,
  };
}

/** Only mods with a file for the server, so every result is compatible. */
async function curseforgeSearch(
  key: string,
  query: string,
  target: ServerTarget,
): Promise<CatalogProject[]> {
  const params = new URLSearchParams({
    gameId: String(MINECRAFT_GAME_ID),
    classId: String(MOD_CLASS_ID),
    searchFilter: query,
    gameVersion: target.gameVersion,
    modLoaderType: String(CURSEFORGE_LOADER_TYPES[target.loader]),
    sortField: '2',
    sortOrder: 'desc',
    pageSize: String(PAGE_SIZE),
  });
  const body = await getJson<{ data: CurseforgeMod[] }>(
    `${CURSEFORGE}/mods/search?${params.toString()}`,
    curseforgeHeaders(key),
  );
  return (body?.data ?? []).map((mod) => fromCurseforge(mod, true));
}

async function curseforgeProject(
  key: string,
  id: string,
  target: ServerTarget,
): Promise<CatalogProject | undefined> {
  if (!/^\d+$/.test(id)) return undefined;
  const body = await getJson<{ data: CurseforgeMod }>(
    `${CURSEFORGE}/mods/${id}`,
    curseforgeHeaders(key),
  );
  const mod = body?.data;
  if (!mod || mod.gameId !== MINECRAFT_GAME_ID || mod.classId !== MOD_CLASS_ID) return undefined;
  // A file for the version and loader is the reliable check: latestFilesIndexes leaves some out.
  const params = new URLSearchParams({
    gameVersion: target.gameVersion,
    modLoaderType: String(CURSEFORGE_LOADER_TYPES[target.loader]),
    pageSize: '1',
  });
  const files = await getJson<{ pagination: { totalCount: number } }>(
    `${CURSEFORGE}/mods/${id}/files?${params.toString()}`,
    curseforgeHeaders(key),
  );
  return fromCurseforge(mod, (files?.pagination.totalCount ?? 0) > 0);
}

// Both

/**
 * Modrinth, then the CurseForge mods that aren't on Modrinth. One source being down still
 * gives the other's results; both down throws CatalogUnavailableError.
 */
const search = defineCachedFunction(
  async (query: string, target: ServerTarget): Promise<CatalogProject[]> => {
    const key = modsEnv().CURSEFORGE_API_KEY;
    const [modrinth, curseforge] = await Promise.allSettled([
      modrinthSearch(query, target),
      key ? curseforgeSearch(key, query, target) : Promise.resolve([]),
    ]);
    if (modrinth.status === 'rejected' && (curseforge.status === 'rejected' || !key)) {
      throw new CatalogUnavailableError('search');
    }
    return mergeCatalogResults(
      modrinth.status === 'fulfilled' ? modrinth.value : [],
      curseforge.status === 'fulfilled' ? curseforge.value : [],
      RESULT_LIMIT,
    );
  },
  {
    name: 'mod-search',
    maxAge: 60 * 60,
    getKey: (query: string, target: ServerTarget) =>
      `${target.loader}-${target.gameVersion}-${query.toLowerCase()}`,
  },
);

/** One project, fetched fresh when it's added, so its details and compatibility can be trusted. */
async function project(
  source: ModCatalogSource,
  id: string,
  target: ServerTarget,
): Promise<CatalogProject | undefined> {
  if (source === 'modrinth') return modrinthProject(id, target);
  const key = modsEnv().CURSEFORGE_API_KEY;
  return key ? curseforgeProject(key, id, target) : undefined;
}

export const modCatalog = { search, project };
