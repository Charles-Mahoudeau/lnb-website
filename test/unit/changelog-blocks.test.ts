import { describe, expect, it } from 'vitest';

import { changelogBlocks } from '../../server/services/changelog-blocks.ts';

describe('changelogBlocks', () => {
  it('splits a post into blocks with styled inlines', () => {
    const md = [
      '## New',
      '',
      'A **bold** and *soft* [link](https://x.fr) with `code` ![alt text](/api/media/a.webp)',
      '',
      '- one',
      '  - nested',
      '',
      '> quoted',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '```',
      'x = 1',
      '```',
    ].join('\n');
    const blocks = changelogBlocks(md);
    expect(blocks[0]).toEqual({ type: 'heading', level: 2, content: [{ text: 'New' }] });
    const p = blocks[1] as { content: { text: string }[] };
    expect(p.content.map((i) => i.text).join('')).toBe('A bold and soft link with code alt text');
    expect(p.content[1]).toEqual({ text: 'bold', bold: true });
    expect(p.content[5]).toEqual({ text: 'link', link: 'https://x.fr' });
    expect(blocks[2]).toMatchObject({ type: 'list', items: [{ depth: 0 }, { depth: 1 }] });
    expect(blocks.find((b) => b.type === 'quote')).toBeTruthy();
    expect(blocks.find((b) => b.type === 'table')).toEqual({
      type: 'table',
      header: [[{ text: 'a' }], [{ text: 'b' }]],
      rows: [[[{ text: '1' }], [{ text: '2' }]]],
    });
    expect(blocks.at(-1)).toEqual({ type: 'code', text: 'x = 1' });
  });
});

describe('changelogBlocks images', () => {
  const md = 'Before ![a cat](/api/media/x.webp) after\n\n- ![in list](/api/media/x.webp)';
  const known = {
    src: 'https://s/x.webp',
    pngUrl: 'https://s/x.webp?format=png',
    width: 10,
    height: 5,
  };

  it('puts a known image in order between the text around it', () => {
    const blocks = changelogBlocks(md, (src) => (src === '/api/media/x.webp' ? known : undefined));
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'image', 'paragraph', 'list']);
    expect(blocks[1]).toEqual({ type: 'image', alt: 'a cat', ...known });
    // Inside a list it stays alt text.
    expect(blocks[3]).toMatchObject({ items: [{ content: [{ text: 'in list' }] }] });
  });

  it('falls back to the alt text when the image is unknown', () => {
    const blocks = changelogBlocks(md, () => undefined);
    expect(blocks[0]).toMatchObject({
      type: 'paragraph',
      content: [{ text: 'Before ' }, { text: 'a cat' }, { text: ' after' }],
    });
  });
});
