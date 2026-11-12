import { inArray, or } from 'drizzle-orm';

import { db } from '~~/server/db';
import { anticheatProject } from '~~/server/db/schema';
import { modsEnv } from '~~/server/lib/mods-env';
import { createLimiter } from '~~/server/lib/rate-limit';
import {
  CURSEFORGE,
  MINECRAFT_GAME_ID,
  MODRINTH,
  curseforgeHeaders,
  getJson,
  modrinthHeaders,
} from '~~/server/services/mods/catalog';
import { catalogIconPath, mergeCatalogResults } from '~~/server/services/mods/rules';

import { refuse } from './shared';

import type { AnticheatProjectKind, AnticheatProjectSearchResult } from '#shared/schemas/anticheat';

// Finds Modrinth and CurseForge projects for an admin to approve or ban. Unlike the mod list's
// search, nothing is filtered by the server's version or loader: players run anything.

const PAGE_SIZE = 10;
const RESULT_LIMIT = 12;

/** 30 searches a minute per admin: enough to type, and easy on the platforms. */
const allowSearch = createLimiter(30, 60);

// Modrinth names its project types and URL paths like our kinds.
const CURSEFORGE_CLASS: Record<AnticheatProjectKind, number> = {
  mod: 6,
  resourcepack: 12,
  shader: 6552,
};
const CURSEFORGE_PATH: Record<AnticheatProjectKind, string> = {
  mod: 'mc-mods',
  resourcepack: 'texture-packs',
  shader: 'shaders',
};

type Found = Omit<AnticheatProjectSearchResult, 'registered' | 'iconUrl'> & {
  slug: string;
  rawIconUrl: string | null;
};

interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  icon_url: string | null;
}

interface CurseforgeMod {
  id: number;
  slug: string;
  name: string;
  summary: string;
  downloadCount: number;
  authors: { name: string }[];
  links: { websiteUrl: string };
  logo: { thumbnailUrl: string; url: string } | null;
}

async function modrinthSearch(query: string, kind: AnticheatProjectKind): Promise<Found[]> {
  const params = new URLSearchParams({
    query,
    limit: String(PAGE_SIZE),
    facets: JSON.stringify([[`project_type:${kind}`]]),
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
    pageUrl: `https://modrinth.com/${kind}/${hit.slug}`,
    rawIconUrl: hit.icon_url || null,
  }));
}

async function curseforgeSearch(
  key: string,
  query: string,
  kind: AnticheatProjectKind,
): Promise<Found[]> {
  const params = new URLSearchParams({
    gameId: String(MINECRAFT_GAME_ID),
    classId: String(CURSEFORGE_CLASS[kind]),
    searchFilter: query,
    sortField: '2',
    sortOrder: 'desc',
    pageSize: String(PAGE_SIZE),
  });
  const body = await getJson<{ data: CurseforgeMod[] }>(
    `${CURSEFORGE}/mods/search?${params.toString()}`,
    curseforgeHeaders(key),
  );
  return (body?.data ?? []).map((mod) => ({
    source: 'curseforge',
    sourceId: String(mod.id),
    slug: mod.slug,
    name: mod.name,
    summary: mod.summary,
    author: mod.authors[0]?.name ?? '',
    downloads: mod.downloadCount,
    pageUrl:
      mod.links.websiteUrl ||
      `https://www.curseforge.com/minecraft/${CURSEFORGE_PATH[kind]}/${mod.slug}`,
    rawIconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || null,
  }));
}

/**
 * Modrinth, then the CurseForge projects that aren't on Modrinth. One platform being down still
 * gives the other's results; both down is "unavailable". Results that already have a registry
 * entry are marked, so the admin sees them instead of hitting "exists".
 */
async function searchProjects(input: {
  adminId: string;
  query: string;
  kind: AnticheatProjectKind;
}): Promise<AnticheatProjectSearchResult[]> {
  if (!(await allowSearch(input.adminId)).allowed) refuse(429, 'rateLimited');

  const key = modsEnv().CURSEFORGE_API_KEY;
  const [modrinth, curseforge] = await Promise.allSettled([
    modrinthSearch(input.query, input.kind),
    key ? curseforgeSearch(key, input.query, input.kind) : Promise.resolve([]),
  ]);
  if (modrinth.status === 'rejected' && (curseforge.status === 'rejected' || !key)) {
    refuse(503, 'unavailable');
  }
  const found = mergeCatalogResults(
    modrinth.status === 'fulfilled' ? modrinth.value : [],
    curseforge.status === 'fulfilled' ? curseforge.value : [],
    RESULT_LIMIT,
  );
  if (found.length === 0) return [];

  const modrinthIds = found.filter((hit) => hit.source === 'modrinth').map((hit) => hit.sourceId);
  const curseforgeIds = found
    .filter((hit) => hit.source === 'curseforge')
    .map((hit) => hit.sourceId);
  const known = await db
    .select({
      modrinthId: anticheatProject.modrinthId,
      curseforgeId: anticheatProject.curseforgeId,
    })
    .from(anticheatProject)
    .where(
      or(
        modrinthIds.length ? inArray(anticheatProject.modrinthId, modrinthIds) : undefined,
        curseforgeIds.length ? inArray(anticheatProject.curseforgeId, curseforgeIds) : undefined,
      ),
    );
  const registered = new Set(
    known.flatMap((row) => [
      row.modrinthId ? `modrinth:${row.modrinthId}` : '',
      row.curseforgeId ? `curseforge:${row.curseforgeId}` : '',
    ]),
  );

  return found.map(({ slug: _slug, rawIconUrl, ...hit }) => ({
    ...hit,
    iconUrl: catalogIconPath(rawIconUrl),
    registered: registered.has(`${hit.source}:${hit.sourceId}`),
  }));
}

export const anticheatSearchService = { searchProjects };
