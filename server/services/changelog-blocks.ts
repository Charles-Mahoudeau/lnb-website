import type { Token } from 'markdown-it';

import { changelogTokens } from './events/markdown.ts';
import type { ChangelogBlock, ChangelogInline } from '../../shared/schemas/changelog.ts';

// A post's Markdown as a list of blocks, for the game (docs/changelog-mod.md). It walks the
// same tokens as the site's HTML, so links and images follow the same rules. No Nuxt imports.

type ImageBlock = Extract<ChangelogBlock, { type: 'image' }>;
/** What the game needs to draw a stored image, or undefined to fall back to its alt text. */
export type ImageResolver = (src: string) => Omit<ImageBlock, 'type' | 'alt'> | undefined;

// With a resolver, a known image becomes an ImageBlock in the list; callers that pass one split
// the list around it. Without one, an image is its alt text.
function inlines(token: Token, images?: ImageResolver): (ChangelogInline | ImageBlock)[] {
  const out: (ChangelogInline | ImageBlock)[] = [];
  let bold = 0;
  let italic = 0;
  const links: string[] = [];
  const add = (text: string, code = false) => {
    const link = links.at(-1);
    out.push({
      text,
      ...(bold && { bold: true as const }),
      ...(italic && { italic: true as const }),
      ...(code && { code: true as const }),
      ...(link && { link }),
    });
  };
  for (const child of token.children ?? []) {
    if (child.type === 'strong_open') bold++;
    else if (child.type === 'strong_close') bold--;
    else if (child.type === 'em_open') italic++;
    else if (child.type === 'em_close') italic--;
    else if (child.type === 'link_open') links.push(child.attrGet('href') ?? '');
    else if (child.type === 'link_close') links.pop();
    else if (child.type === 'softbreak' || child.type === 'hardbreak') add('\n');
    else if (child.type === 'code_inline') add(child.content, true);
    else if (child.type === 'image') {
      const found = images?.(child.attrGet('src') ?? '');
      if (found) out.push({ type: 'image', alt: child.content, ...found });
      else add(child.content);
    } else if (child.type === 'text') add(child.content);
  }
  return out;
}

type Cell = ChangelogInline[];

export function changelogBlocks(markdown: string, images?: ImageResolver): ChangelogBlock[] {
  const plain = (t: Token) => inlines(t) as ChangelogInline[]; // no resolver: no image blocks
  const blocks: ChangelogBlock[] = [];
  let heading = 0;
  let depth = -1;
  let list: Extract<ChangelogBlock, { type: 'list' }> | null = null;
  let quote = 0;
  let table: Extract<ChangelogBlock, { type: 'table' }> | null = null;
  let row: Cell[] = [];
  let inHead = false;
  let inCell = false;

  for (const t of changelogTokens(markdown)) {
    switch (t.type) {
      case 'heading_open':
        heading = Number(t.tag.slice(1));
        break;
      case 'blockquote_open':
        quote++;
        break;
      case 'blockquote_close':
        quote--;
        break;
      case 'bullet_list_open':
      case 'ordered_list_open':
        depth++;
        // shortcut: a list nested in another keeps the outer list's ordered flag, upgrade if posts mix them
        list ??= { type: 'list', ordered: t.type === 'ordered_list_open', items: [] };
        if (depth === 0) blocks.push(list);
        break;
      case 'bullet_list_close':
      case 'ordered_list_close':
        if (--depth < 0) list = null;
        break;
      case 'thead_open':
        inHead = true;
        table = { type: 'table', header: [], rows: [] };
        blocks.push(table);
        break;
      case 'thead_close':
        inHead = false;
        break;
      case 'th_open':
      case 'td_open':
        inCell = true;
        break;
      case 'th_close':
      case 'td_close':
        inCell = false;
        break;
      case 'tr_open':
        row = [];
        break;
      case 'tr_close':
        if (inHead) table!.header = row;
        else table!.rows.push(row);
        break;
      case 'fence':
      case 'code_block': {
        const text = t.content.replace(/\n$/, '');
        if (list) list.items.push({ depth, content: [{ text, code: true }] });
        else blocks.push({ type: 'code', text });
        break;
      }
      case 'hr':
        blocks.push({ type: 'rule' });
        break;
      case 'inline': {
        if (heading) blocks.push({ type: 'heading', level: heading, content: plain(t) });
        else if (inCell) row.push(plain(t));
        else if (list) list.items.push({ depth, content: plain(t) });
        else if (quote) blocks.push({ type: 'quote', content: plain(t) });
        else {
          // A paragraph with pictures becomes text, picture, text... in order.
          let run: ChangelogInline[] = [];
          for (const part of inlines(t, images)) {
            if ('type' in part) {
              if (run.length) blocks.push({ type: 'paragraph', content: run });
              run = [];
              blocks.push(part);
            } else run.push(part);
          }
          if (run.length) blocks.push({ type: 'paragraph', content: run });
        }
        break;
      }
      case 'heading_close':
        heading = 0;
        break;
      case 'table_close':
        table = null;
        break;
    }
  }
  return blocks;
}
