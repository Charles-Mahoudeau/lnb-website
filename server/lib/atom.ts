// An Atom feed (RFC 4287) as a string. Pure, with no Nuxt imports, so it is easy to test.

export interface AtomEntry {
  id: string;
  title: string;
  url: string;
  published: Date;
  updated: Date;
  summary?: string | null;
  /** HTML, escaped into the entry. */
  html: string;
}

export interface AtomFeed {
  id: string;
  title: string;
  lang: string;
  selfUrl: string;
  alternateUrl: string;
  updated: Date;
  entries: readonly AtomEntry[];
}

/** Atom readers show only what the feed gives, so the most recent entries are the ones that count. */
export const ATOM_LIMIT = 20;

export function escapeXml(text: string): string {
  return (
    text
      // Control characters other than tab and line breaks are not allowed in XML 1.0.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  );
}

export function buildAtom(feed: AtomFeed): string {
  const entries = feed.entries.slice(0, ATOM_LIMIT).map(
    (entry) => `  <entry>
    <id>${escapeXml(entry.id)}</id>
    <title>${escapeXml(entry.title)}</title>
    <link rel="alternate" type="text/html" href="${escapeXml(entry.url)}"/>
    <published>${entry.published.toISOString()}</published>
    <updated>${entry.updated.toISOString()}</updated>${
      entry.summary ? `\n    <summary>${escapeXml(entry.summary)}</summary>` : ''
    }
    <content type="html">${escapeXml(entry.html)}</content>
  </entry>`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${escapeXml(feed.lang)}">
  <id>${escapeXml(feed.id)}</id>
  <title>${escapeXml(feed.title)}</title>
  <link rel="self" type="application/atom+xml" href="${escapeXml(feed.selfUrl)}"/>
  <link rel="alternate" type="text/html" href="${escapeXml(feed.alternateUrl)}"/>
  <updated>${feed.updated.toISOString()}</updated>
${entries.join('\n')}
</feed>
`;
}

/** Makes the site paths of `src="/..."` absolute, since a feed reader isn't on our site. */
export function absoluteImages(html: string, origin: string): string {
  return html.replace(/src="\/(?!\/)/g, `src="${origin}`);
}
