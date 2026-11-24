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

  describe('hostile input', () => {
    const smile = cp(0x1f600);

    it('counts astral characters as one code point each: 280 pass, 281 are tooLong', () => {
      expect(checkFeedText(smile.repeat(280))).toEqual({
        ok: true,
        text: smile.repeat(280),
        length: 280,
      });
      expect(checkFeedText(smile.repeat(281))).toEqual({
        ok: false,
        problem: 'tooLong',
        length: 281,
      });
      // A skin-toned emoji is two: 140 of them are 280.
      const thumb = '\u{1F44D}\u{1F3FD}';
      expect(checkFeedText(thumb.repeat(140))).toMatchObject({ ok: true, length: 280 });
      expect(checkFeedText(thumb.repeat(141))).toMatchObject({ problem: 'tooLong' });
    });

    it.each([
      ['C0 controls', '\u0000\u0001\u0008\u001b\u001f'],
      ['DEL and C1 controls', '\u007f\u0080\u0085\u009f'],
      ['section signs', cp(0xa7, 0xa7)],
      ['lone surrogates', '\udfff\ud800\udbff'],
      ['tabs and returns', '\t\r\r\n\t'],
      ['every kind of space', cp(0x20, 0xa0, 0x1680, 0x2000, 0x200a, 0x202f, 0x205f, 0x3000)],
      ['line and paragraph separators', cp(0x2028, 0x2029, 0x0a)],
      ['a mix of all', `\t${cp(0xa7)}\u0000 \ud800\r\n${cp(0x3000)}`],
    ])('refuses a text of only %s as emptyText', (_name, input) => {
      expect(checkFeedText(input)).toMatchObject({ ok: false, problem: 'emptyText', length: 0 });
    });

    it('cleans before it trims and folds', () => {
      // Controls between spaces vanish, so the spaces meet and are trimmed.
      expect(cleanFeedText(' \u0000 hi \u0007 ')).toBe('hi');
      // Line feeds made from CR count toward the fold.
      expect(cleanFeedText('a\r\n\r\n\r\nb')).toBe('a\n\nb');
      expect(cleanFeedText('a\r\r\rb')).toBe('a\n\nb');
      // A control between line feeds goes first, so they fold.
      expect(cleanFeedText('a\n\u0000\n\u0001\nb')).toBe('a\n\nb');
      // Folding never leaves a line feed at an edge.
      expect(cleanFeedText('\n\n\n\na\n\n\n\n')).toBe('a');
    });

    it('keeps a BOM before spaces, and separators inside the text', () => {
      expect(cleanFeedText(`${cp(0xfeff)}  hi  `)).toBe(`${cp(0xfeff)}  hi`);
      expect(cleanFeedText(`a${cp(0x2028)}b${cp(0x2029)}c`)).toBe(`a${cp(0x2028)}b${cp(0x2029)}c`);
      expect(checkFeedText(cp(0x200b))).toEqual({ ok: true, text: cp(0x200b), length: 1 });
    });

    it('composes after dropping, so a dropped control can join a letter to its accent', () => {
      expect(cleanFeedText(`e\u0000${ACUTE}`)).toBe(E_ACUTE);
    });

    it('counts 281 raw characters that clean down to 280 as 280', () => {
      expect(checkFeedText(` ${a(280)}`)).toMatchObject({ ok: true, length: 280 });
      expect(checkFeedText(`${a(280)}\u0000`)).toMatchObject({ ok: true, length: 280 });
      expect(checkFeedText(`${a(279)}${cp(0xa7)}b`)).toMatchObject({ ok: true, length: 280 });
    });
  });
});
