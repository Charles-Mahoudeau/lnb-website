import { z } from 'zod';

import { modCatalogSource } from './mods.ts';

// The Modlist (/admin/modpack/modlist): the mods of the launcher's modpack, each pinned to one file. Contracts
// shared by the routes and the pages. See docs/modpack.md. Responses are schemas too, so the API
// reference is built from the same definitions as the types.

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

export const MODPACK_PROBLEMS = [
  'notFound',
  'duplicate',
  'incompatible',
  'sourceUnavailable',
  'badUrl',
  'unreachable',
  'tooLarge',
  'notAJar',
  'fileNotFound',
  'notModFile',
  'notUploaded',
  'nothingToAdopt',
  'notToolFile',
  'tooManyRetired',
] as const;
export type ModpackProblem = (typeof MODPACK_PROBLEMS)[number];

/** Where a mod's file comes from: a source's download, a link, or a file of the Files library. */
export const MODPACK_SOURCES = ['modrinth', 'curseforge', 'url', 'upload'] as const;
export const modpackSource = z.enum(MODPACK_SOURCES);
export type ModpackSource = z.infer<typeof modpackSource>;

export const MODPACK_SIDES = ['both', 'client', 'server'] as const;
export const modpackSide = z.enum(MODPACK_SIDES);
export type ModpackSide = z.infer<typeof modpackSide>;

/** Why a mod is left out of the manifest until an admin acts. */
export const MODPACK_ATTENTIONS = ['noCompatibleFile', 'downloadBlocked', 'urlChanged'] as const;
export const modpackAttention = z.enum(MODPACK_ATTENTIONS);
export type ModpackAttention = z.infer<typeof modpackAttention>;

/** `attention` means the mod is out of the manifest, `update` that a newer file is waiting. */
export const MODPACK_STATUSES = ['ok', 'update', 'attention'] as const;
export const modpackStatus = z.enum(MODPACK_STATUSES);
export type ModpackStatus = z.infer<typeof modpackStatus>;

export const modpackIdParams = z.object({ id: z.uuid() });

/** One file of a mod, as the manifest will list it. */
export const modpackFile = z.object({
  version: z.string().describe('The version label, such as 0.6.1.'),
  fileName: z.string(),
  url: z
    .string()
    .nullable()
    .describe("Where it downloads from. For a Files library file, this site's own address."),
  sha256: z.string().nullable().describe('Known for uploaded files and files the site downloaded.'),
  sha512: z.string().nullable(),
  size: z.number().nullable(),
});
export type ModpackFile = z.infer<typeof modpackFile>;

export const modpackModView = z.object({
  id: z.uuid(),
  name: z.string(),
  summary: z.string(),
  pageUrl: z.string().nullable(),
  source: modpackSource,
  sourceId: z.string().nullable(),
  side: modpackSide,
  optional: z.boolean(),
  status: modpackStatus,
  attention: modpackAttention.nullable(),
  pinned: modpackFile.nullable().describe('The file the manifest lists. Null while none is set.'),
  pinnedFileId: z.uuid().nullable().describe('The Files library entry it points at, if any.'),
  latest: modpackFile.nullable().describe('The newest compatible file the nightly check found.'),
  latestCheckedAt: isoDate.nullable(),
  updatedAt: isoDate,
});
export type ModpackModView = z.infer<typeof modpackModView>;

export const modpackList = z.object({
  revision: z.number().describe('Goes up by one with every change to the manifest.'),
  changedAt: isoDate,
  totalBytes: z.number().describe('What a launcher downloads for the whole pack.'),
  items: z.array(modpackModView),
});
export type ModpackList = z.infer<typeof modpackList>;

const label = z.string().trim().min(1).max(80);
const version = z.string().trim().min(1).max(40);

/** Body of POST /api/minecraft/admin/modpack/mods. */
export const modpackAddBody = z.discriminatedUnion('source', [
  z.object({
    source: modCatalogSource,
    sourceId: z.string().regex(/^[\w-]{1,64}$/),
    side: modpackSide.optional(),
    optional: z.boolean().optional(),
  }),
  z.object({
    source: z.literal('url'),
    name: label,
    version,
    url: z.url({ protocol: /^https$/ }).max(500),
    side: modpackSide.optional(),
    optional: z.boolean().optional(),
  }),
  z.object({
    source: z.literal('upload'),
    name: label,
    version,
    fileId: z.uuid(),
    side: modpackSide.optional(),
    optional: z.boolean().optional(),
  }),
]);
export type ModpackAddBody = z.infer<typeof modpackAddBody>;

/** Body of PATCH /api/minecraft/admin/modpack/mods/{id}. */
export const modpackPatchBody = z
  .object({
    name: label,
    side: modpackSide,
    optional: z.boolean(),
    version: version.describe("A custom or uploaded mod's version label."),
  })
  .partial();
export type ModpackPatchBody = z.infer<typeof modpackPatchBody>;

/** Body of PUT /api/minecraft/admin/modpack/mods/{id}/file: switch to a Files library jar. */
export const modpackPinBody = z.object({ fileId: z.uuid(), version });
export type ModpackPinBody = z.infer<typeof modpackPinBody>;

/** The launcher's own tools. Each is a jar of the Files library: `launcher` is a wrapper, `updater` an updater. */
export const MODPACK_TOOLS = ['launcher', 'updater'] as const;
export const modpackTool = z.enum(MODPACK_TOOLS);
export type ModpackTool = z.infer<typeof modpackTool>;

/** The Files library kind each tool's jar must have. */
export const MODPACK_TOOL_KINDS = { launcher: 'wrapper', updater: 'updater' } as const;

export const modpackToolParams = z.object({ tool: modpackTool });

/** Body of PUT /api/minecraft/admin/modpack/tools/{tool}: make a library jar the current one. */
export const modpackToolBody = z.object({
  fileId: z.uuid(),
  version,
  notes: z.string().trim().max(500).default(''),
});
export type ModpackToolBody = z.infer<typeof modpackToolBody>;

export const modpackToolView = z.object({
  tool: modpackTool,
  version: z.string(),
  notes: z.string(),
  fileId: z.uuid(),
  fileName: z.string(),
  size: z.number(),
  sha256: z.string(),
  sha512: z.string(),
  url: z.string().describe('The public download link, a path on this site.'),
  publishedAt: isoDate,
  publishedBy: z.string().nullable().describe('The first name of who published it, or null.'),
});
export type ModpackToolView = z.infer<typeof modpackToolView>;

export const modpackToolList = z.object({
  items: z.array(modpackToolView).describe('The tools that have a current file.'),
});
export type ModpackToolList = z.infer<typeof modpackToolList>;

export const modpackCreated = z.object({ id: z.uuid() });

/** What a check for newer files found. */
export const modpackCheckResult = z.object({
  checked: z.number().describe('Mods looked at: those from Modrinth, CurseForge or a link.'),
  updates: z.number().describe('Mods with a newer file than the pinned one, after the check.'),
  failed: z.number().describe('Mods whose source could not be reached. They keep what was known.'),
});
export type ModpackCheckResult = z.infer<typeof modpackCheckResult>;

export const modpackAdoptedResult = z.object({ adopted: z.number() });

/** How the vote's official list is copied to the Modlist. */
export const MODPACK_EXPORT_MODES = ['add', 'sync', 'replace'] as const;
export const modpackExportMode = z.enum(MODPACK_EXPORT_MODES);
export type ModpackExportMode = z.infer<typeof modpackExportMode>;

export const modpackExportQuery = z.object({ mode: modpackExportMode });

/** One change the export would make. `custom` marks a link or uploaded entry that Replace drops. */
export const modpackExportItem = z.object({
  key: z.string().describe('Sent back to apply this change.'),
  kind: z.enum(['add', 'remove', 'update']),
  name: z.string(),
  source: modpackSource,
  custom: z.boolean(),
  optional: z.boolean().describe('For an update, the new value.'),
});
export type ModpackExportItem = z.infer<typeof modpackExportItem>;

export const modpackExportPreview = z.object({
  revision: z.number(),
  items: z.array(modpackExportItem),
  skipped: z
    .array(z.string())
    .describe('Official mods added by hand, which have no source to download from.'),
});
export type ModpackExportPreview = z.infer<typeof modpackExportPreview>;

/** Body of POST /api/minecraft/admin/modpack/export. */
export const modpackExportBody = z.object({
  mode: modpackExportMode,
  keys: z.array(z.string().max(80)).max(1000),
});
export type ModpackExportBody = z.infer<typeof modpackExportBody>;

export const modpackExportResult = z.object({
  added: z.number(),
  removed: z.number(),
  updated: z.number(),
  flagged: z.number().describe('Added mods with no usable file, left out of the manifest.'),
  failed: z
    .number()
    .describe('Mods whose source could not be reached. Nothing was changed for them.'),
});
export type ModpackExportResult = z.infer<typeof modpackExportResult>;

const manifestHashes = z.object({
  sha256: z.string().optional().describe('Only when the site knows it.'),
  sha512: z.string(),
});

const manifestTool = z.object({
  version: z.string(),
  fileName: z.string(),
  size: z.number(),
  hashes: manifestHashes,
  url: z.url(),
});

/** The public manifest the launcher reads. Bump `schema` for a change older launchers can't read. */
export const modpackManifest = z.object({
  schema: z.literal(1),
  revision: z.number().describe('Goes up by one with every change an admin makes to the pack.'),
  updatedAt: isoDate,
  gameVersion: z.string(),
  loader: z.string(),
  loaderVersion: z
    .string()
    .describe("The loader's version, such as 21.1.172. Empty when an admin hasn't set it."),
  tools: z
    .object({
      launcher: manifestTool.optional(),
      updater: manifestTool.optional(),
    })
    .describe(
      "The launcher's own jars, each the current one. A tool nobody has published is missing. The launcher updates the updater, and the updater updates the launcher, by comparing these hashes with its own.",
    ),
  mods: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      side: modpackSide,
      optional: z.boolean(),
      version: z.string(),
      fileName: z.string(),
      size: z.number(),
      hashes: manifestHashes,
      downloads: z.array(z.url()).describe('Absolute https addresses, tried in order.'),
      source: modpackSource,
      projectUrl: z.string().nullable(),
      icon: z
        .url()
        .nullable()
        .describe("The mod's logo, an absolute address on this site. Null when none is stored."),
    }),
  ),
  assets: z.array(
    z.object({
      name: z.string(),
      kind: z.literal('asset'),
      size: z.number(),
      hashes: manifestHashes,
      url: z.url(),
    }),
  ),
  retired: z
    .array(
      z.object({
        fileName: z.string(),
        sha512: z.string().optional().describe('When set, only a file with this hash matches.'),
      }),
    )
    .describe(
      'Files the updater deletes from the mods folder although it never wrote them, such as mods removed before it kept a journal. Empty while the `modpack.retired` flag is off.',
    ),
});
export type ModpackManifest = z.infer<typeof modpackManifest>;

// Retired files: what launchers delete although the updater's journal never listed it. See docs/modpack.md.

export const MODPACK_RETIRED_MAX = 500;
/** A retired file counts as safe to drop once no player has had it for this many days. */
export const MODPACK_RETIRED_SAFE_DAYS = 14;

/** A plain file name: no folder, no control character, never `.` or `..`. */
function isPlainFileName(name: string): boolean {
  if (name === '.' || name === '..') return false;
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 32 || name[i] === '/' || name[i] === '\\') return false;
  }
  return true;
}
export const retiredFileName = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(isPlainFileName, { message: 'Not a plain file name' });
const retiredSha512 = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9a-f]{128}$/, '128 hex characters');
const retiredNote = z.string().trim().max(300);

export const modpackRetiredAddBody = z.object({
  items: z
    .array(z.object({ fileName: retiredFileName, sha512: retiredSha512.optional() }))
    .min(1)
    .max(MODPACK_RETIRED_MAX),
  note: retiredNote.default(''),
});
export type ModpackRetiredAddBody = z.infer<typeof modpackRetiredAddBody>;

export const modpackRetiredPatchBody = z
  .object({
    fileName: retiredFileName,
    sha512: retiredSha512.nullable(),
    note: retiredNote,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change' });
export type ModpackRetiredPatchBody = z.infer<typeof modpackRetiredPatchBody>;

export const modpackRetiredView = z.object({
  id: z.uuid(),
  fileName: z.string(),
  sha512: z.string().nullable(),
  note: z.string(),
  addedAt: isoDate,
  addedBy: z
    .string()
    .nullable()
    .describe('The first name of the admin, or null for a removed account.'),
  players: z
    .number()
    .nullable()
    .describe(
      'Accounts whose latest anticheat report holds the file. Null while the anticheat is off.',
    ),
  lastSeenAt: isoDate
    .nullable()
    .describe(
      'The newest report, of any player, that held the file. Null when none did or the anticheat is off.',
    ),
  safeToDrop: z
    .boolean()
    .describe('No player has had it for at least 14 days, and the entry is at least that old.'),
  zeroDays: z
    .number()
    .nullable()
    .describe(
      'Days since a player last had it. Null while players still have it or are not counted.',
    ),
});
export type ModpackRetiredView = z.infer<typeof modpackRetiredView>;

export const modpackRetiredList = z.object({
  items: z.array(modpackRetiredView),
  counted: z.boolean().describe('False while the anticheat is off: players are not counted.'),
  max: z.number(),
});
export type ModpackRetiredList = z.infer<typeof modpackRetiredList>;

export const modpackRetiredAddResult = z.object({
  added: z.number(),
  skipped: z.number().describe('Names already in the list.'),
});
export type ModpackRetiredAddResult = z.infer<typeof modpackRetiredAddResult>;

export const modpackRetiredPlayers = z.object({
  items: z.array(z.object({ userId: z.string(), name: z.string(), lastReportAt: isoDate })),
  total: z.number(),
});
export type ModpackRetiredPlayers = z.infer<typeof modpackRetiredPlayers>;
