import { createError } from 'nuxt/server';

type ChangelogLang = 'en' | 'fr';

// Machine translation through DeepL, for the changelog (docs/changelog.md). It runs only when an
// editor presses "Translate". The source text is never logged.

/** Free keys end in ":fx" and use their own host. */
function endpoint(key: string): string {
  return key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

export function translationAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.DEEPL_API_KEY);
}

function refuse(status: number, problem: string): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

const escapeXml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const unescapeXml = (text: string) =>
  text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

// What must come back untouched: fenced code, inline code, then link and bare URLs.
const PROTECTED =
  /(^|\n)(```|~~~)[\s\S]*?(?:\n\2[^\n]*|$)|`[^`\n]+`|\]\([^)\s]*\)|https?:\/\/[^\s<>)\]]+/g;

/**
 * Swaps the parts that must not be translated for `<x id="n"/>` tags, which DeepL is told to
 * ignore. `restore` puts them back.
 */
export function protectMarkdown(markdown: string): {
  text: string;
  restore: (translated: string) => string;
} {
  const kept: string[] = [];
  let out = '';
  let last = 0;
  for (const match of markdown.matchAll(PROTECTED)) {
    out += escapeXml(markdown.slice(last, match.index));
    out += `<x id="${String(kept.length)}"/>`;
    kept.push(match[0]);
    last = match.index + match[0].length;
  }
  out += escapeXml(markdown.slice(last));
  return {
    text: out,
    restore: (translated) =>
      unescapeXml(
        translated.replace(/<x id="(\d+)"\s*\/>/g, (_, n: string) => kept[Number(n)] ?? ''),
      ),
  };
}

/**
 * Translates several Markdown texts from `from` to the other language. Empty texts stay empty.
 * Throws 503 `translationUnavailable` without a key, 429 `translationQuota` over quota and 502
 * `translationFailed` for anything else.
 */
export async function translateMarkdown(
  texts: string[],
  from: ChangelogLang,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const key = env.DEEPL_API_KEY;
  if (!key) refuse(503, 'translationUnavailable');
  const guards = texts.map((text) => protectMarkdown(text));
  const sent = guards.map((guard) => guard.text);
  const todo = sent.map((text, index) => (text.trim() ? index : -1)).filter((index) => index >= 0);
  if (!todo.length) return texts.map(() => '');

  let response: Response;
  try {
    response = await fetch(endpoint(key), {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: todo.map((index) => sent[index]),
        source_lang: from.toUpperCase(),
        target_lang: from === 'en' ? 'FR' : 'EN-GB',
        tag_handling: 'xml',
        ignore_tags: ['x'],
        preserve_formatting: true,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    refuse(502, 'translationFailed');
  }
  if (response.status === 456) refuse(429, 'translationQuota');
  if (!response.ok) refuse(502, 'translationFailed');
  const data = (await response.json().catch(() => null)) as {
    translations?: { text?: string }[];
  } | null;
  const translated = data?.translations;
  if (translated?.length !== todo.length) refuse(502, 'translationFailed');

  const result = texts.map(() => '');
  todo.forEach((index, n) => {
    result[index] = guards[index]!.restore(translated[n]?.text ?? '');
  });
  return result;
}
