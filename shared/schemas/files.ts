import { z } from 'zod';

// The Files library (/admin/mods/files): jars and assets the launcher downloads. Contracts shared
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

/** What a file is for. A wrapper is the launcher's own jar, a mod a jar of the pack, an asset anything else. */
export const FILE_KINDS = ['mod', 'wrapper', 'asset'] as const;
export const fileKind = z.enum(FILE_KINDS);
export type FileKind = z.infer<typeof fileKind>;

/** The icon of each kind's tile. */
export const FILE_KIND_ICONS: Record<FileKind, string> = {
  mod: 'i-lucide-box',
  wrapper: 'i-lucide-rocket',
  asset: 'i-lucide-file',
};

export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** The extensions each kind accepts. Mod and wrapper jars must also be zip archives. */
export const FILE_EXTENSIONS: Record<FileKind, readonly string[]> = {
  mod: ['jar'],
  wrapper: ['jar'],
  asset: ['zip', 'txt', 'json', 'dat', 'toml', 'properties', 'cfg'],
};

/** The kinds whose files are zip archives, so their first bytes are checked. */
export const ZIP_EXTENSIONS: readonly string[] = ['jar', 'zip'];

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
