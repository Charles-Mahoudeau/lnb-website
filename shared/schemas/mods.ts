import { z } from 'zod';

// Mod list contracts, shared by the routes and the pages. See docs/mods.md.
// Responses are schemas too, so the API reference is built from the same definitions as the
// types. The server doesn't check its own responses with them.

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

export const MOD_LOADERS = ['neoforge', 'fabric', 'forge', 'quilt'] as const;
export const modLoader = z.enum(MOD_LOADERS);
export type ModLoader = z.infer<typeof modLoader>;

/** Where a mod comes from. Mods added by hand by admins are `manual`. */
export const modSource = z.enum(['modrinth', 'curseforge', 'manual']);
export type ModSource = z.infer<typeof modSource>;

/** The sources people can search and suggest from. */
export const modCatalogSource = z.enum(['modrinth', 'curseforge']);
export type ModCatalogSource = z.infer<typeof modCatalogSource>;

export const modListName = z.enum(['official', 'suggestion']);
export type ModListName = z.infer<typeof modListName>;

/** Why someone wants a mod. Shown publicly with the suggestion. */
export const REASON_MIN = 10;
export const REASON_MAX = 500;
export const modReason = z.string().trim().min(REASON_MIN).max(REASON_MAX);

/** A Modrinth project ID (base62) or a CurseForge mod ID (digits). */
const catalogId = z.string().regex(/^[\w-]{1,64}$/);

export const modIdParams = z.object({ id: z.coerce.number().int().positive() });

export const modSettingsView = z.object({
  open: z.boolean().describe('Whether voting and suggesting are open.'),
  maxSuggestions: z.number().describe('Suggestions each person can have in the list.'),
  gameVersion: z.string().describe('The Minecraft version of the server, such as 1.21.1.'),
  loader: modLoader,
});
export type ModSettingsView = z.infer<typeof modSettingsView>;

/** Body of PATCH /api/minecraft/admin/settings. */
export const modSettingsPatchBody = z
  .object({
    open: z.boolean(),
    maxSuggestions: z.number().int().min(0).max(50),
    gameVersion: z
      .string()
      .trim()
      .regex(/^\d{1,2}\.\d{1,2}(?:\.\d{1,2})?$/, 'a Minecraft version, such as 1.21.1 or 26.1'),
    loader: modLoader,
  })
  .partial();
export type ModSettingsPatchBody = z.infer<typeof modSettingsPatchBody>;

/** A mod as everyone sees it. */
export const modView = z.object({
  id: z.number(),
  list: modListName,
  source: modSource,
  name: z.string(),
  summary: z.string(),
  pageUrl: z.string(),
  iconUrl: z.string().nullable().describe('Served by this site. Null when the mod has no icon.'),
  score: z.number().describe('Upvotes minus downvotes.'),
  up: z.number(),
  down: z.number(),
  suggested: z.boolean().describe('Whether the mod came from a suggestion.'),
  proposerName: z
    .string()
    .nullable()
    .describe('Null for mods added by admins, and for suggestions whose author was deleted.'),
  reason: z.string().nullable(),
  createdAt: isoDate,
  myVote: z.union([z.literal(-1), z.literal(0), z.literal(1)]).describe('0 when signed out.'),
  mine: z.boolean().describe("Whether it's the viewer's own suggestion. They can't vote on it."),
});
export type ModView = z.infer<typeof modView>;

/** A removed suggestion, shown to its author until they dismiss it. */
export const modRemovalNotice = z.object({
  id: z.number(),
  name: z.string(),
  reason: z.string(),
  removedAt: isoDate,
});
export type ModRemovalNotice = z.infer<typeof modRemovalNotice>;

/** GET /api/minecraft/mods: everything the page shows, in one request. */
export const modListPage = z.object({
  settings: modSettingsView.omit({ maxSuggestions: true }),
  official: z.array(modView),
  suggestions: z.array(modView),
  me: z
    .object({
      suggestionsLeft: z.number(),
      maxSuggestions: z.number(),
      banned: z.boolean().describe('A Warden ban in force blocks voting and suggesting.'),
      removed: z.array(modRemovalNotice),
    })
    .nullable()
    .describe('Null when signed out.'),
});
export type ModListPage = z.infer<typeof modListPage>;

/** Body of PUT /api/minecraft/mods/{id}/vote. 0 clears the vote. */
export const modVoteBody = z.object({
  value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});
export type ModVoteBody = z.infer<typeof modVoteBody>;

export const modVoteResult = modView.pick({ score: true, up: true, down: true, myVote: true });
export type ModVoteResult = z.infer<typeof modVoteResult>;

/** GET /api/minecraft/mods/search?q= */
export const modSearchQuery = z.object({ q: z.string().trim().min(2).max(80) });

export const modSearchResult = z.object({
  source: modCatalogSource,
  sourceId: z.string(),
  name: z.string(),
  summary: z.string(),
  author: z.string(),
  downloads: z.number(),
  pageUrl: z.string(),
  iconUrl: z
    .string()
    .nullable()
    .describe('Served by this site, from the source. Null when the mod has no icon.'),
  status: z
    .enum(['available', 'listed', 'removed', 'incompatible'])
    .describe(
      '`listed`: already in a tab. `removed`: removed by admins. `incompatible`: not for the server version and loader. Only `available` mods can be added.',
    ),
  listedModId: z.number().nullable().describe('The mod in the list, when `listed`.'),
});
export type ModSearchResult = z.infer<typeof modSearchResult>;

export const modSearchResults = z.object({ items: z.array(modSearchResult) });

/** GET /api/minecraft/mods/catalog-icon?src= */
export const modCatalogIconQuery = z.object({
  src: z.url().max(500).describe("An icon URL on Modrinth's or CurseForge's image host."),
});

/** Body of POST /api/minecraft/mods. */
export const modSuggestBody = z.object({
  source: modCatalogSource,
  sourceId: catalogId,
  reason: modReason,
});
export type ModSuggestBody = z.infer<typeof modSuggestBody>;

export const modCreated = z.object({ id: z.number() });

/** Body of PATCH /api/minecraft/mods/{id}. */
export const modReasonBody = z.object({ reason: modReason });

// Admin

export const modAdminQuery = z.object({
  list: modListName,
  status: z.enum(['visible', 'removed']).default('visible'),
});

export const modAdminRow = modView.omit({ myVote: true, mine: true }).extend({
  status: z.enum(['visible', 'removed']),
  proposer: z
    .object({ userId: z.string(), name: z.string(), email: z.string() })
    .nullable()
    .describe('Null for mods added by admins, and for suggestions whose author was deleted.'),
  removedReason: z.string().nullable(),
  removedAt: isoDate.nullable(),
  promotedAt: isoDate.nullable(),
});
export type ModAdminRow = z.infer<typeof modAdminRow>;

export const modAdminList = z.object({ items: z.array(modAdminRow) });

/** Body of POST /api/minecraft/admin/mods: from a search result, or by hand. */
export const modAddBody = z.discriminatedUnion('source', [
  z.object({ source: modCatalogSource, sourceId: catalogId }),
  z.object({
    source: z.literal('manual'),
    name: z.string().trim().min(1).max(80),
    summary: z.string().trim().max(200).default(''),
    pageUrl: z.url({ protocol: /^https$/ }).max(500),
    iconUrl: z
      .url({ protocol: /^https$/ })
      .max(500)
      .optional()
      .describe('Downloaded once by the site.'),
  }),
]);
export type ModAddBody = z.input<typeof modAddBody>;

/** Body of POST /api/minecraft/admin/mods/{id}/remove. Shown to the person who suggested it. */
export const modRemoveBody = z.object({ reason: z.string().trim().min(3).max(300) });
export type ModRemoveBody = z.infer<typeof modRemoveBody>;

/** Why a mod list request was refused, in `data.problem`. */
export const MOD_PROBLEMS = [
  'closed',
  'banned',
  'ownMod',
  'limitReached',
  'duplicate',
  'removed',
  'incompatible',
  'notFound',
  'notSuggestion',
  'notOfficial',
  'rateLimited',
  'sourceUnavailable',
] as const;
export type ModProblem = (typeof MOD_PROBLEMS)[number];
