import { z } from 'zod';

import { modCatalogSource } from './mods.ts';

// The Modlist (/admin/mods): the mods of the launcher's modpack, each pinned to one file. Contracts
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

export const modpackCreated = z.object({ id: z.uuid() });

/** What a check for newer files found. */
export const modpackCheckResult = z.object({
  checked: z.number().describe('Mods looked at: those from Modrinth, CurseForge or a link.'),
  updates: z.number().describe('Mods with a newer file than the pinned one, after the check.'),
  failed: z.number().describe('Mods whose source could not be reached. They keep what was known.'),
});
export type ModpackCheckResult = z.infer<typeof modpackCheckResult>;

export const modpackAdoptedResult = z.object({ adopted: z.number() });
