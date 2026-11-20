import type { changelogPost } from '~~/server/db/schema';

import type { ChangelogDetail, ChangelogList } from '#shared/schemas/changelog';

// The admin's views of a changelog post (docs/changelog.md).

type Post = typeof changelogPost.$inferSelect;

const iso = (date: Date | null) => date?.toISOString() ?? null;

export function listItem(post: Post): ChangelogList['posts'][number] {
  const source = post.sourceLang === 'en' ? 'En' : 'Fr';
  const other = source === 'En' ? 'Fr' : 'En';
  return {
    id: post.id,
    title: post[`title${source}`] ?? '',
    versionTag: post.versionTag,
    status: post.status,
    publishedAt: iso(post.publishedAt),
    createdAt: post.createdAt.toISOString(),
    sourceLang: post.sourceLang,
    hasTranslation: Boolean(post[`title${other}`]),
    translationUnreviewed: post.translationUnreviewed,
  };
}

export function detail(post: Post): ChangelogDetail {
  return {
    id: post.id,
    slug: post.slug,
    status: post.status,
    publishedAt: iso(post.publishedAt),
    versionTag: post.versionTag,
    sourceLang: post.sourceLang,
    translationUnreviewed: post.translationUnreviewed,
    texts: {
      en: { title: post.titleEn ?? '', summary: post.summaryEn ?? '', body: post.bodyEn ?? '' },
      fr: { title: post.titleFr ?? '', summary: post.summaryFr ?? '', body: post.bodyFr ?? '' },
    },
    updatedAt: post.updatedAt.toISOString(),
  };
}
