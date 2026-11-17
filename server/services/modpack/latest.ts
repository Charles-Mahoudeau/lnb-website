import { modsEnv } from '~~/server/lib/mods-env';
import {
  CatalogUnavailableError,
  CURSEFORGE,
  MODRINTH,
  curseforgeHeaders,
  getJson,
  modrinthHeaders,
} from '~~/server/services/mods/catalog';
import { CURSEFORGE_LOADER_TYPES } from '~~/server/services/mods/rules';
import type { ServerTarget } from '~~/server/services/mods/rules';

import { downloadAndHash, DownloadError } from './download';

import type { ModpackProblem, ModpackSource } from '#shared/schemas/modpack';

// The newest file of a mod for the server's game version and loader, from its source. Used when a
// mod is added, and by the nightly check.

export interface ResolvedFile {
  version: string;
  fileName: string;
  url: string;
  sha256: string | null;
  sha512: string;
  size: number;
}

/**
 * `blocked`: the file exists but its source forbids downloads from outside (CurseForge's "allow
 * distribution" switch), so the jar has to be uploaded. `none`: no file fits the server.
 */
export type Resolution =
  | { kind: 'file'; file: ResolvedFile }
  | { kind: 'blocked'; version: string; fileName: string }
  | { kind: 'none' };

/** Thrown when the source can't be reached, so a failed check never reads as "no file". */
export class SourceUnavailableError extends Error {
  readonly problem: ModpackProblem = 'sourceUnavailable';
}

interface ModrinthVersion {
  version_number: string;
  version_type: 'release' | 'beta' | 'alpha';
  date_published: string;
  files: {
    url: string;
    filename: string;
    primary: boolean;
    size: number;
    hashes: { sha512: string };
  }[];
}

/** Quilt loads Fabric mods, so both are asked for. */
const loadersFor = (target: ServerTarget) =>
  target.loader === 'quilt' ? ['quilt', 'fabric'] : [target.loader];

/** Sources, javadoc and dev jars that sit beside the real file in a version. */
const EXTRA_JAR = /-(sources?|javadoc|dev)\.jar$/i;

async function modrinthLatest(id: string, target: ServerTarget): Promise<Resolution> {
  const params = new URLSearchParams({
    game_versions: JSON.stringify([target.gameVersion]),
    loaders: JSON.stringify(loadersFor(target)),
  });
  const versions = await getJson<ModrinthVersion[]>(
    `${MODRINTH}/project/${encodeURIComponent(id)}/version?${params.toString()}`,
    modrinthHeaders(),
  );
  // Newest first. A release beats a newer beta, so a pack doesn't drift onto pre-releases.
  const best = versions?.find((v) => v.version_type === 'release') ?? versions?.[0];
  // Some authors flag their sources jar as primary, so those are skipped unless nothing else is left.
  const runnable = best?.files.filter((f) => !EXTRA_JAR.test(f.filename));
  const candidates = runnable?.length ? runnable : best?.files;
  const file = candidates?.find((f) => f.primary) ?? candidates?.[0];
  if (!best || !file) return { kind: 'none' };
  return {
    kind: 'file',
    file: {
      version: best.version_number,
      fileName: file.filename,
      url: file.url,
      sha256: null,
      sha512: file.hashes.sha512,
      size: file.size,
    },
  };
}

interface CurseforgeFile {
  displayName: string;
  fileName: string;
  downloadUrl: string | null;
  fileLength: number;
  fileDate: string;
  releaseType: number;
}

/** CurseForge's file hosts. */
const CURSEFORGE_HOSTS = ['forgecdn.net', 'curseforge.com'];

async function curseforgeLatest(
  key: string,
  id: string,
  target: ServerTarget,
  known?: KnownFile,
): Promise<Resolution> {
  const params = new URLSearchParams({
    gameVersion: target.gameVersion,
    modLoaderType: String(CURSEFORGE_LOADER_TYPES[target.loader]),
    pageSize: '50',
  });
  const body = await getJson<{ data: CurseforgeFile[] }>(
    `${CURSEFORGE}/mods/${id}/files?${params.toString()}`,
    curseforgeHeaders(key),
  );
  const files = [...(body?.data ?? [])].sort((a, b) => b.fileDate.localeCompare(a.fileDate));
  const best = files.find((f) => f.releaseType === 1) ?? files[0];
  if (!best) return { kind: 'none' };
  const version = best.displayName.replace(/\.jar$/i, '');
  if (!best.downloadUrl) return { kind: 'blocked', version, fileName: best.fileName };
  // A file already hashed under the same link is the same file: CurseForge file links hold the
  // file's ID, so the nightly check doesn't download every jar again.
  if (known?.url === best.downloadUrl && known.sha512) {
    return {
      kind: 'file',
      file: {
        version,
        fileName: best.fileName,
        url: best.downloadUrl,
        sha256: known.sha256,
        sha512: known.sha512,
        size: known.size,
      },
    };
  }
  // CurseForge gives a SHA-1 and an MD5 only, so the file is downloaded to get its SHA-512.
  try {
    const hashed = await downloadAndHash(best.downloadUrl, CURSEFORGE_HOSTS);
    return {
      kind: 'file',
      file: {
        version,
        fileName: best.fileName,
        url: best.downloadUrl,
        sha256: hashed.sha256,
        sha512: hashed.sha512,
        size: hashed.size,
      },
    };
  } catch (error) {
    if (error instanceof DownloadError) throw new SourceUnavailableError(error.problem);
    throw error;
  }
}

/** A file the site already hashed, so a source's unchanged file isn't downloaded again. */
export interface KnownFile {
  url: string | null;
  sha256: string | null;
  sha512: string | null;
  size: number;
}

/** The newest compatible file of a project on Modrinth or CurseForge. */
export async function resolveLatest(
  source: Extract<ModpackSource, 'modrinth' | 'curseforge'>,
  sourceId: string,
  target: ServerTarget,
  known?: KnownFile,
): Promise<Resolution> {
  try {
    if (source === 'modrinth') return await modrinthLatest(sourceId, target);
    const key = modsEnv().CURSEFORGE_API_KEY;
    if (!key || !/^\d+$/.test(sourceId)) throw new SourceUnavailableError('no key');
    return await curseforgeLatest(key, sourceId, target, known);
  } catch (error) {
    if (error instanceof SourceUnavailableError) throw error;
    if (error instanceof CatalogUnavailableError) throw new SourceUnavailableError(error.message);
    throw error;
  }
}
