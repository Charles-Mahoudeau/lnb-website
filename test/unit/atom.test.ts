import { describe, expect, it } from 'vitest';

import { absoluteImages, ATOM_LIMIT, buildAtom, escapeXml } from '../../server/lib/atom.ts';

const date = new Date('2026-11-18T10:00:00Z');
const entry = (n: number) => ({
  id: `https://lnb.test/minecraft/changelog/post-${String(n)}`,
  title: `Post ${String(n)}`,
  url: `https://lnb.test/minecraft/changelog/post-${String(n)}`,
  published: date,
  updated: date,
  summary: 'A & B',
  html: '<p>Hello <b>you</b></p>',
});
const feed = (entries: ReturnType<typeof entry>[]) =>
  buildAtom({
    id: 'https://lnb.test/minecraft/changelog',
    title: 'LNB <changelog> "feed"',
    lang: 'en',
    selfUrl: 'https://lnb.test/minecraft/changelog.atom?lang=en&x=1',
    alternateUrl: 'https://lnb.test/minecraft/changelog',
    updated: date,
    entries,
  });

describe('atom feed', () => {
  it('escapes text, attributes and the HTML content', () => {
    const xml = feed([entry(1)]);
    expect(xml).toContain('<title>LNB &lt;changelog&gt; &quot;feed&quot;</title>');
    expect(xml).toContain('href="https://lnb.test/minecraft/changelog.atom?lang=en&amp;x=1"');
    expect(xml).toContain('<summary>A &amp; B</summary>');
    expect(xml).toContain(
      '<content type="html">&lt;p&gt;Hello &lt;b&gt;you&lt;/b&gt;&lt;/p&gt;</content>',
    );
    expect(xml).toContain('<published>2026-11-18T10:00:00.000Z</published>');
  });

  it('keeps at most 20 entries', () => {
    const xml = feed(Array.from({ length: 25 }, (_, n) => entry(n)));
    expect(xml.match(/<entry>/g)).toHaveLength(ATOM_LIMIT);
  });

  it('makes site image paths absolute, and leaves other addresses alone', () => {
    const html =
      '<img src="/api/media/a.webp"><img src="//cdn.example/b.png"><img src="https://x/c">';
    expect(absoluteImages(html, 'https://lnb.test/')).toBe(
      '<img src="https://lnb.test/api/media/a.webp"><img src="//cdn.example/b.png"><img src="https://x/c">',
    );
  });

  it('drops characters XML cannot hold', () => {
    expect(escapeXml('a\u0000b\u000Bc\td')).toBe('abc\td');
  });
});
