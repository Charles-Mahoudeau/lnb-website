import { defineEventHandler, getQuery } from 'nuxt/server';

import { absoluteImages, buildAtom, ATOM_LIMIT } from '~~/server/lib/atom';
import { siteUrl } from '~~/server/lib/site';
import { changelogService, renderBody } from '~~/server/services/changelog';

import { changelogLang } from '#shared/schemas/changelog';

const TITLES = {
  en: 'LNB Minecraft changelog',
  fr: 'Changelog Minecraft de LNB',
} as const;

// Not under /api: feed readers fetch it from the changelog page. `?lang=` picks the language;
// a post without text in it comes in its source language.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'changelog');
  const lang = changelogLang.catch('fr').parse(getQuery(event).lang);
  const { posts } = await changelogService.listPublished({ lang, limit: ATOM_LIMIT });
  // Image paths in the HTML are made absolute, since a reader isn't on our site.
  const feed = buildAtom({
    id: siteUrl('/minecraft/changelog'),
    title: TITLES[lang],
    lang,
    selfUrl: siteUrl(`/minecraft/changelog.atom${lang === 'fr' ? '' : '?lang=' + lang}`),
    alternateUrl: siteUrl('/minecraft/changelog'),
    updated: posts[0]?.publishedAt ?? new Date(0),
    entries: posts.map((post) => ({
      id: siteUrl(`/minecraft/changelog/${post.slug}`),
      title: post.title,
      url: siteUrl(`/minecraft/changelog/${post.slug}`),
      published: post.publishedAt!,
      updated: post.publishedAt!,
      summary: post.summary,
      html: absoluteImages(renderBody(post.body), siteUrl('/')),
    })),
  });
  return new Response(feed, {
    headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
  });
});
