import { describe, expect, it } from 'vitest';

import {
  descriptionSummary,
  descriptionText,
  renderChangelog,
  renderDescription,
} from '../../server/services/events/markdown.ts';

describe('event descriptions', () => {
  it('renders the formatting managers use', () => {
    const html = renderDescription('Bring **snacks**.\n\n- Werewolf\n- Among Us');
    expect(html).toContain('<strong>snacks</strong>');
    expect(html).toContain('<li>Werewolf</li>');
  });

  it('escapes raw HTML', () => {
    const html = renderDescription('<script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops images, and links that are not http, https or mailto', () => {
    expect(renderDescription('![art](https://example.com/a.png)')).not.toContain('<img');
    const html = renderDescription('[click](javascript:alert(1)) [ok](https://lnb.example)');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('href="https://lnb.example"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it('makes plain text for the BDE website and embeds', () => {
    expect(
      descriptionText(
        'Two rounds of **Werewolf**, then [Among Us](https://x.y).\n\n- 19:30 doors\n- 21:00 games',
      ),
    ).toBe('Two rounds of Werewolf, then Among Us.\n- 19:30 doors\n- 21:00 games');
  });

  it('cuts a summary at a word', () => {
    const summary = descriptionSummary('word '.repeat(100), 50);
    expect(summary.length).toBeLessThanOrEqual(50);
    expect(summary.endsWith('word…')).toBe(true);
  });
});

describe('changelog posts', () => {
  it('renders tables, code, quotes, headings and links', () => {
    const html = renderChangelog(
      '## Fixes\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\ncode\n```\n\n> quote\n\n[x](https://lnb.example)',
    );
    expect(html).toContain('<table>');
    expect(html).toContain('<h2>Fixes</h2>');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('target="_blank"');
  });

  it('escapes raw HTML and unsafe links', () => {
    const html = renderChangelog('<script>alert(1)</script> [x](javascript:alert(1))');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('href="javascript');
  });

  it('keeps uploaded changelog images, lazy, and nothing pointing elsewhere', () => {
    const key = `changelog-${'a'.repeat(64)}.webp`;
    const html = renderChangelog(`![A shot](/api/media/${key})`);
    expect(html).toContain(`src="/api/media/${key}"`);
    expect(html).toContain('alt="A shot"');
    expect(html).toContain('loading="lazy"');
    for (const src of ['//evil.example/a.png', '/api/media/../x', 'data:image/png;base64,AAAA']) {
      expect(renderChangelog(`![alt text](${src})`)).not.toContain('<img');
    }
  });

  it('keeps images from the media library only', () => {
    expect(renderChangelog('![map](/api/media/abc123.webp)')).toContain(
      '<img src="/api/media/abc123.webp" alt="map"',
    );
    const other = renderChangelog('![map](https://evil.example/a.png)');
    expect(other).not.toContain('<img');
    expect(other).toContain('map');
  });
});
