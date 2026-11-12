import type {
  AnticheatCurseforgeProject,
  AnticheatModrinthProject,
  AnticheatPlatformVersion,
} from '~~/server/db/schema';
import { modsEnv } from '~~/server/lib/mods-env';
import {
  CURSEFORGE,
  CatalogUnavailableError,
  MINECRAFT_GAME_ID,
  MODRINTH,
  curseforgeHeaders,
  modrinthHeaders,
  postJson,
  getJson,
} from '~~/server/services/mods/catalog';

// Hash lookups on Modrinth and CurseForge. Errors throw CatalogUnavailableError; "not found" is a
// normal, empty result. Hashes are never logged. See docs/anticheat.md.

const CHUNK = 200;

export type ModrinthVersion = NonNullable<AnticheatPlatformVersion['modrinth']> & {
  projectId: string;
};
export type CurseforgeFile = NonNullable<AnticheatPlatformVersion['curseforge']> & {
  modId: number;
};

export interface ModrinthMatches {
  versions: Map<string, ModrinthVersion>;
  projects: Map<string, AnticheatModrinthProject>;
}
export interface CurseforgeMatches {
  files: Map<number, CurseforgeFile>;
  projects: Map<number, AnticheatCurseforgeProject>;
}

/** What the lookup needs from the platforms; tests pass a fake. */
export interface PlatformClient {
  curseforgeConfigured: boolean;
  modrinthByHashes(sha512s: string[]): Promise<ModrinthMatches>;
  curseforgeByFingerprints(fingerprints: number[]): Promise<CurseforgeMatches>;
}

// Response shapes, reduced to the fields we read.
export interface RawModrinthVersion {
  id: string;
  project_id: string;
  version_number: string;
  loaders: string[];
  date_published: string;
}
export interface RawModrinthProject {
  id: string;
  slug: string | null;
  title: string;
  project_type: string;
  status: string;
  downloads: number;
  published: string;
  server_side: string;
}
export interface RawCurseforgeMatch {
  id: number;
  file: { id: number; modId: number; fileDate: string; fileFingerprint: number };
}
export interface RawCurseforgeMod {
  id: number;
  slug: string;
  name: string;
  downloadCount: number;
  dateCreated: string;
}

export function mapModrinthVersion(raw: RawModrinthVersion): ModrinthVersion {
  return {
    versionId: raw.id,
    projectId: raw.project_id,
    versionNumber: raw.version_number,
    loaders: raw.loaders,
    publishedAt: raw.date_published,
  };
}

export function mapModrinthProject(
  raw: RawModrinthProject,
  fetchedAt = new Date(),
): AnticheatModrinthProject {
  return {
    id: raw.id,
    slug: raw.slug ?? raw.id,
    title: raw.title,
    projectType: raw.project_type,
    status: raw.status,
    downloads: raw.downloads,
    publishedAt: raw.published,
    serverSide: raw.server_side,
    fetchedAt: fetchedAt.toISOString(),
  };
}

export function mapCurseforgeFile(raw: RawCurseforgeMatch): CurseforgeFile {
  return { fileId: raw.file.id, modId: raw.file.modId, publishedAt: raw.file.fileDate };
}

export function mapCurseforgeMod(
  raw: RawCurseforgeMod,
  fetchedAt = new Date(),
): AnticheatCurseforgeProject {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    downloadCount: raw.downloadCount,
    dateCreated: raw.dateCreated,
    fetchedAt: fetchedAt.toISOString(),
  };
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

async function modrinthProjects(ids: string[]): Promise<Map<string, AnticheatModrinthProject>> {
  const projects = new Map<string, AnticheatModrinthProject>();
  for (const part of chunks(ids)) {
    const params = new URLSearchParams({ ids: JSON.stringify(part) });
    const raw = await getJson<RawModrinthProject[]>(
      `${MODRINTH}/projects?${params.toString()}`,
      modrinthHeaders(),
    );
    for (const project of raw ?? []) projects.set(project.id, mapModrinthProject(project));
  }
  return projects;
}

async function modrinthByHashes(sha512s: string[]): Promise<ModrinthMatches> {
  const versions = new Map<string, ModrinthVersion>();
  for (const part of chunks(sha512s)) {
    const raw = await postJson<Record<string, RawModrinthVersion>>(
      `${MODRINTH}/version_files`,
      modrinthHeaders(),
      { hashes: part, algorithm: 'sha512' },
    );
    for (const [hash, version] of Object.entries(raw ?? {})) {
      versions.set(hash.toLowerCase(), mapModrinthVersion(version));
    }
  }
  const projectIds = [...new Set([...versions.values()].map((version) => version.projectId))];
  return { versions, projects: await modrinthProjects(projectIds) };
}

async function curseforgeByFingerprints(fingerprints: number[]): Promise<CurseforgeMatches> {
  const key = modsEnv().CURSEFORGE_API_KEY;
  const files = new Map<number, CurseforgeFile>();
  const projects = new Map<number, AnticheatCurseforgeProject>();
  if (!key || fingerprints.length === 0) return { files, projects };
  for (const part of chunks(fingerprints)) {
    const raw = await postJson<{ data: { exactMatches: RawCurseforgeMatch[] } }>(
      `${CURSEFORGE}/fingerprints/${String(MINECRAFT_GAME_ID)}`,
      curseforgeHeaders(key),
      { fingerprints: part },
    );
    for (const match of raw?.data.exactMatches ?? []) {
      files.set(match.file.fileFingerprint, mapCurseforgeFile(match));
    }
  }
  const modIds = [...new Set([...files.values()].map((file) => file.modId))];
  for (const part of chunks(modIds)) {
    const raw = await postJson<{ data: RawCurseforgeMod[] }>(
      `${CURSEFORGE}/mods`,
      curseforgeHeaders(key),
      { modIds: part },
    );
    for (const mod of raw?.data ?? []) projects.set(mod.id, mapCurseforgeMod(mod));
  }
  return { files, projects };
}

export const platformClient: PlatformClient = {
  get curseforgeConfigured() {
    return Boolean(modsEnv().CURSEFORGE_API_KEY);
  },
  modrinthByHashes,
  curseforgeByFingerprints,
};

export { CatalogUnavailableError };
