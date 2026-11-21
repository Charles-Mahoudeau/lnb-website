import { z } from 'zod';

// Changelog admin contracts, shared by the routes and the pages. See docs/changelog.md.

export const CHANGELOG_PROBLEMS = [
  'notFound',
  'invalid',
  'alreadyPublished',
  'translationUnavailable',
  'translationQuota',
  'translationFailed',
  'imageTooLarge',
  'imageUnreadable',
] as const;
export type ChangelogProblem = (typeof CHANGELOG_PROBLEMS)[number];

export const CHANGELOG_LANGS = ['en', 'fr'] as const;
export const changelogLang = z.enum(CHANGELOG_LANGS);
export const CHANGELOG_STATUSES = ['draft', 'scheduled', 'published'] as const;

const isoDate = z.string().meta({ format: 'date-time' });

export const changelogIdParams = z.object({ id: z.uuid() });

const title = z.string().trim().min(1).max(160);
const summary = z.string().trim().max(400).nullable();
const body = z.string().min(1).max(50_000);
const versionTag = z.string().trim().max(40).nullable();

/** The text of a post in one language. */
export const changelogTextBody = z.object({
  title,
  summary: summary.optional(),
  body,
});

export const changelogCreateBody = z.object({
  sourceLang: z.enum(CHANGELOG_LANGS),
  source: changelogTextBody,
  versionTag: versionTag.optional(),
});
export type ChangelogCreateBody = z.infer<typeof changelogCreateBody>;

export const changelogPatchBody = z
  .object({
    source: changelogTextBody.partial(),
    translation: changelogTextBody.describe('Saving it marks the translation as reviewed.'),
    versionTag,
  })
  .partial();
export type ChangelogPatchBody = z.infer<typeof changelogPatchBody>;

export const changelogScheduleBody = z.object({
  at: z.iso.datetime().describe('A date in the future.'),
});

export const changelogPreviewBody = z.object({ markdown: z.string().max(50_000) });
export const changelogPreviewView = z.object({ html: z.string() });

/** An image uploaded for a post: its key in the media library and the address to put in the text. */
export const changelogStoredImage = z.object({
  key: z.string(),
  url: z.string(),
  width: z.number(),
  height: z.number(),
});
export type ChangelogStoredImage = z.infer<typeof changelogStoredImage>;

const textView = z.object({ title: z.string(), summary: z.string(), body: z.string() });
export type ChangelogTextView = z.infer<typeof textView>;

export const changelogListItem = z.object({
  id: z.uuid(),
  title: z.string().describe('In the source language.'),
  versionTag: z.string().nullable(),
  status: z.enum(CHANGELOG_STATUSES),
  /** The publish date, or the date it goes out for a scheduled post. */
  publishedAt: isoDate.nullable(),
  createdAt: isoDate,
  sourceLang: z.enum(CHANGELOG_LANGS),
  hasTranslation: z.boolean(),
  translationUnreviewed: z.boolean(),
});
export const changelogList = z.object({ posts: z.array(changelogListItem) });
export type ChangelogList = z.infer<typeof changelogList>;

export const changelogDetail = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: z.enum(CHANGELOG_STATUSES),
  publishedAt: isoDate.nullable(),
  versionTag: z.string().nullable(),
  sourceLang: z.enum(CHANGELOG_LANGS),
  translationUnreviewed: z.boolean(),
  /** Both languages; the one with no text yet has empty strings. */
  texts: z.object({ en: textView, fr: textView }),
  updatedAt: isoDate,
});
export type ChangelogDetail = z.infer<typeof changelogDetail>;

export const changelogTranslationStatus = z.object({
  available: z.boolean().describe('Whether `DEEPL_API_KEY` is set.'),
});

// The public side: the pages, the feed and `GET /api/changelog/posts*`, without sign-in.

export const changelogSlugParams = z.object({ slug: z.string().min(1).max(80) });

export const changelogPublicListQuery = z.object({
  lang: z
    .enum(CHANGELOG_LANGS)
    .optional()
    .describe('French when the post has it, else its source.'),
  limit: z.coerce.number().int().min(1).max(50).optional().describe('10 by default.'),
  before: z.string().max(200).optional().describe('The `next` cursor of the previous page.'),
});
export const changelogPublicPostQuery = changelogPublicListQuery.pick({ lang: true });

export const changelogPublicPost = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  versionTag: z.string().nullable(),
  publishedAt: isoDate,
  lang: z.enum(CHANGELOG_LANGS).describe('The language actually returned.'),
  languages: z.array(z.enum(CHANGELOG_LANGS)).describe('The languages the post has.'),
  coverUrl: z.string().nullable().describe('A path on this site, or null.'),
});
export type ChangelogPublicPost = z.infer<typeof changelogPublicPost>;

export const changelogPublicList = z.object({
  posts: z.array(changelogPublicPost),
  next: z.string().nullable().describe('The cursor of the following page, or null at the end.'),
});
export type ChangelogPublicList = z.infer<typeof changelogPublicList>;

const neighbour = z.object({ slug: z.string(), title: z.string() }).nullable();
export const changelogPublicDetail = changelogPublicPost.extend({
  html: z.string().describe('The body as safe HTML.'),
  older: neighbour,
  newer: neighbour,
});
export type ChangelogPublicDetail = z.infer<typeof changelogPublicDetail>;

// The Minecraft server's side: `/api/changelog/server/*`, with the server secret.

// The body as a list of blocks, so the mod needs no Markdown parser. Images are gone (their alt
// text stays), and links are absolute http(s) or mailto.
export const changelogInline = z.object({
  text: z.string().describe('A line break is a "\\n".'),
  bold: z.literal(true).optional(),
  italic: z.literal(true).optional(),
  code: z.literal(true).optional(),
  link: z.string().optional().describe('The address the text links to.'),
});
export type ChangelogInline = z.infer<typeof changelogInline>;
const inlines = z.array(changelogInline);
export const changelogBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), level: z.number().int().min(1).max(6), content: inlines }),
  z.object({ type: z.literal('paragraph'), content: inlines }),
  z.object({ type: z.literal('quote'), content: inlines }),
  z.object({
    type: z.literal('list'),
    ordered: z.boolean(),
    items: z.array(
      z.object({
        depth: z.number().int().min(0).describe('0 is the top level.'),
        content: inlines,
      }),
    ),
  }),
  z.object({ type: z.literal('code'), text: z.string() }),
  z.object({
    type: z.literal('table'),
    header: z.array(inlines),
    rows: z.array(z.array(inlines)),
  }),
  z.object({ type: z.literal('rule') }),
]);
export type ChangelogBlock = z.infer<typeof changelogBlock>;

export const changelogServerPost = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  versionTag: z.string().nullable(),
  publishedAt: isoDate,
  lang: z.enum(CHANGELOG_LANGS).describe('The language actually returned.'),
  url: z.string().describe('The post on the site, absolute.'),
});
export const changelogServerDetail = changelogServerPost.extend({
  body: z.string().describe('Markdown source, in the language returned.'),
  blocks: z.array(changelogBlock).describe('The same text, already split into blocks.'),
});
export type ChangelogServerPost = z.infer<typeof changelogServerPost>;
export type ChangelogServerDetail = z.infer<typeof changelogServerDetail>;
export const changelogServerList = z.object({
  posts: z.array(changelogServerPost),
  next: z.string().nullable().describe('The cursor of the following page, or null at the end.'),
});
export const changelogServerUnseenQuery = z.object({
  player: z.uuid(),
  lang: z
    .enum(CHANGELOG_LANGS)
    .optional()
    .describe('French when the post has it, else its source.'),
});
export const changelogServerUnseen = z.object({
  post: changelogServerDetail.nullable().describe('Null when there is nothing to show.'),
});
export const changelogSeenBody = z.object({ player: z.uuid() });
