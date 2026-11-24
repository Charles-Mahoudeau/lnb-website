// The text rule of Feed (docs/feed.md, "Text"), applied by the site to every post and reply and
// used by the browser's composer to count as the site does. It matches the phone's `TextLimits`
// and `TextState`: every step only removes or shortens, so a text the phone's counter allowed (at
// most 280 code points of NFC, sent trimmed) always passes. Test vectors: docs/feed-mod.md, 13.1.

/** The longest post or reply, in code points after cleaning. */
export const FEED_TEXT_MAX = 280;
/** The longest raw text a request may carry, in code points as Zod counts them (longer is a plain 400). */
export const FEED_TEXT_RAW_MAX = 4000;

export type FeedTextProblem = 'emptyText' | 'tooLong';

export type FeedTextResult =
  | { ok: true; text: string; length: number }
  | { ok: false; problem: FeedTextProblem; length: number };

/**
 * Whether the phone can type this code point (`TextState.isAllowed`): not a C0 control but LF,
 * not DEL or a C1 control, not the section sign (Minecraft's formatting code), not a lone
 * surrogate.
 */
export function isFeedCodePointAllowed(codePoint: number): boolean {
  if (codePoint === 0x0a) return true;
  if (codePoint <= 0x1f) return false;
  if (codePoint >= 0x7f && codePoint <= 0x9f) return false;
  if (codePoint === 0xa7) return false;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return false;
  return true;
}

// Kotlin's String.trim() once controls are gone: LF, the space separators (U+00A0 included), and
// the line and paragraph separators. Not String.prototype.trim(), which also strips U+FEFF.
const EDGE_SPACE = /^[\n\p{Zs}\p{Zl}\p{Zp}]+|[\n\p{Zs}\p{Zl}\p{Zp}]+$/gu;

/** The text as the site stores it: cleaned, NFC, trimmed, with at most one empty line in a row. */
export function cleanFeedText(raw: string): string {
  let cleaned = '';
  // for...of walks code points, and yields a lone surrogate on its own.
  for (const char of raw.replace(/\r\n?/g, '\n').replace(/\t/g, ' ')) {
    if (isFeedCodePointAllowed(char.codePointAt(0)!)) cleaned += char;
  }
  return cleaned
    .normalize('NFC')
    .replace(EDGE_SPACE, '')
    .replace(/\n{3,}/g, '\n\n');
}

/** The number of code points, as PostgreSQL's char_length and the phone count them. */
export function countCodePoints(text: string): number {
  return Array.from(text).length;
}

/** Cleans a text and checks its length: 1 to 280 code points. */
export function checkFeedText(raw: string): FeedTextResult {
  const text = cleanFeedText(raw);
  const length = countCodePoints(text);
  if (length === 0) return { ok: false, problem: 'emptyText', length };
  if (length > FEED_TEXT_MAX) return { ok: false, problem: 'tooLong', length };
  return { ok: true, text, length };
}
