import { describe, expect, it } from 'vitest';

import {
  checkFeedText,
  cleanFeedText,
  countCodePoints,
  isFeedCodePointAllowed,
} from '../../shared/utils/feed-text.ts';

// The text vectors of docs/feed-mod.md, 13.1, shared with the mod's FeedRulesTest.

const a = (n: number) => 'a'.repeat(n);
// Code points by number, so no invisible character sits in this file.
const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const ACUTE = cp(0x301);
const E_ACUTE = cp(0xe9);

const accepted: [name: string, input: string, stored: string, count: number][] = [
  ['trims spaces', '  Salut  ', 'Salut', 5],
  ['composes to NFC', `e${ACUTE}te${ACUTE}`, `${E_ACUTE}t${E_ACUTE}`, 3],
  ['counts a skin-toned emoji as two', '\u{1F44D}\u{1F3FD}', '\u{1F44D}\u{1F3FD}', 2],
  ['counts a flag as two', '\u{1F1EB}\u{1F1F7}', '\u{1F1EB}\u{1F1F7}', 2],
  ['takes 280 characters', a(280), a(280), 280],
  ['counts after NFC', `${a(279)}e${ACUTE}`, a(279) + E_ACUTE, 280],
  ['turns CR LF into LF', 'a\r\nb', 'a\nb', 3],
  ['turns a lone CR into LF', 'a\rb', 'a\nb', 3],
  ['turns a tab into a space', 'a\tb', 'a b', 3],
  ['drops the section sign', `${cp(0xa7)}cRouge`, 'cRouge', 6],
  ['drops C0 and C1 controls', 'a\u0000b\u0085c', 'abc', 3],
  ['folds blank lines', 'a\n\n\n\nb', 'a\n\nb', 4],
  ['trims an ideographic space', `${cp(0x3000)}bonjour `, 'bonjour', 7],
  ['keeps a BOM, which is not whitespace', `${cp(0xfeff)}hi`, `${cp(0xfeff)}hi`, 3],
  ['keeps a zero-width space', `a${cp(0x200b)}b`, `a${cp(0x200b)}b`, 3],
];

describe('the Feed text rule', () => {
  it.each(accepted)('%s', (_name, input, stored, count) => {
    expect(checkFeedText(input)).toEqual({ ok: true, text: stored, length: count });
  });

  it('refuses 281 characters as tooLong', () => {
    expect(checkFeedText(a(281))).toEqual({ ok: false, problem: 'tooLong', length: 281 });
  });

  it.each([
    ['spaces and a line feed', '   \n   '],
    ['nothing', ''],
  ])('refuses %s as emptyText', (_name, input) => {
    expect(checkFeedText(input)).toEqual({ ok: false, problem: 'emptyText', length: 0 });
  });

  it('drops lone surrogates but keeps pairs', () => {
    expect(cleanFeedText('a\ud800b\udc00c\u{1F600}')).toBe('abc\u{1F600}');
  });

  it('trims a no-break space and the line and paragraph separators', () => {
    expect(cleanFeedText(`${cp(0xa0, 0x2028)}hi${cp(0x2029)}\n`)).toBe('hi');
  });

  it('keeps one empty line, and spaces between line feeds', () => {
    expect(cleanFeedText('a\n\nb')).toBe('a\n\nb');
    expect(cleanFeedText('a\n \n \nb')).toBe('a\n \n \nb');
  });

  it('counts code points, not UTF-16 units', () => {
    expect(countCodePoints('\u{1F600}')).toBe(1);
    expect(countCodePoints('')).toBe(0);
  });

  it('allows LF and printable characters only', () => {
    expect(isFeedCodePointAllowed(0x0a)).toBe(true);
    expect(isFeedCodePointAllowed(0x09)).toBe(false);
    expect(isFeedCodePointAllowed(0x7f)).toBe(false);
    expect(isFeedCodePointAllowed(0xa0)).toBe(true);
    expect(isFeedCodePointAllowed(0xa7)).toBe(false);
  });
});
