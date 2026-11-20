import { z } from 'zod';

// The Files library (/admin/modpack/files): jars and assets the launcher downloads. Contracts shared
// by the routes and the pages. See docs/files.md. Responses are schemas too, so the API reference
// is built from the same definitions as the types.

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

export const FILE_PROBLEMS = [
  'fileNotFound',
  'fileTooLarge',
  'fileEmpty',
  'fileBadName',
  'fileBadType',
  'fileDuplicate',
  'fileInUse',
  'fileUnreadable',
] as const;
export type FileProblem = (typeof FILE_PROBLEMS)[number];

/**
 * What a file is for. A wrapper is the launcher's own jar, an updater the mod updater's jar, a mod
 * a jar of the pack, a download a file people fetch from /minecraft/download (docs/downloads.md),
 * an asset anything else.
 */
export const FILE_KINDS = ['mod', 'wrapper', 'updater', 'asset', 'download'] as const;
export const fileKind = z.enum(FILE_KINDS);
export type FileKind = z.infer<typeof fileKind>;

/** The icon of each kind's tile. */
export const FILE_KIND_ICONS: Record<FileKind, string> = {
  mod: 'i-lucide-box',
  wrapper: 'i-lucide-rocket',
  updater: 'i-lucide-refresh-cw',
  asset: 'i-lucide-file',
  download: 'i-lucide-download',
};

export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** The extensions each kind accepts. Mod and wrapper jars must also be zip archives. */
export const FILE_EXTENSIONS: Record<FileKind, readonly string[]> = {
  mod: ['jar'],
  wrapper: ['jar'],
  updater: ['jar'],
  asset: ['zip', 'txt', 'json', 'dat', 'toml', 'properties', 'cfg'],
  // Installers and archives for players. Kept apart from the assets, which the launcher's manifest
  // lists, so none of these ever reaches a launcher.
  download: ['zip', 'exe', 'msi', 'dmg', 'pkg', 'appimage', 'gz'],
};

/** The kinds a file can have, from its name's extension: what an admin can switch it to. */
export function kindsFor(name: string): FileKind[] {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return FILE_KINDS.filter((kind) => FILE_EXTENSIONS[kind].includes(extension));
}

/** The kinds whose files are zip archives, so their first bytes are checked. */
export const ZIP_EXTENSIONS: readonly string[] = ['jar', 'zip'];

/** Body of PATCH /api/admin/files/{id}. */
export const fileKindBody = z.object({ kind: fileKind });
export type FileKindBody = z.infer<typeof fileKindBody>;

export const fileIdParams = z.object({ id: z.uuid() });
export const fileDownloadParams = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  name: z.string().min(1).max(200),
});

/** The upload route takes the file as the raw body, so what describes it goes in the query. */
export const fileUploadQuery = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      'The file name, with its extension. Characters other than letters, digits and `._+-` become `_`.',
    ),
  kind: fileKind.default('mod'),
});

export const fileView = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: fileKind,
  size: z.number().int().describe('Bytes.'),
  sha256: z.string().describe('Lowercase hex.'),
  sha512: z.string().describe('Lowercase hex.'),
  url: z.string().describe('The public download link, a path on this site.'),
  usedBy: z.array(z.string()).describe('What points at the file. A file in use cannot be deleted.'),
  uploadedAt: isoDate,
  uploadedBy: z.string().nullable().describe('The first name of who uploaded it, or null.'),
});
export type FileView = z.infer<typeof fileView>;

export const fileList = z.object({
  items: z.array(fileView),
  totalBytes: z.number().int().describe('The size of every file together.'),
});
export type FileList = z.infer<typeof fileList>;
