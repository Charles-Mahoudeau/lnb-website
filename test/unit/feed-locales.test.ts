import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import en from '../../i18n/locales/en.json' with { type: 'json' };
import fr from '../../i18n/locales/fr.json' with { type: 'json' };
import { FEED_PROBLEMS } from '../../shared/schemas/feed.ts';

// The Feed's strings (docs/feed.md, "Pages"): every `feed.*` and `nav.feed*` key in both locales,
// each one filled and with the same placeholders, plural forms where a count is shown, every key
// the Feed's code asks for, and "LNB" never "La LNB".

/** Every string of a locale by its dotted key (lists, such as a poster's sticker lines, are left out). */
function flatten(messages: object, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(messages) as [string, unknown][]) {
    if (typeof value === 'string') out.set(`${prefix}${key}`, value);
    else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [inner, text] of flatten(value, `${prefix}${key}.`)) out.set(inner, text);
    }
  }
  return out;
}

const locales = { en: flatten(en), fr: flatten(fr) };
const isFeedKey = (key: string) => key.startsWith('feed.') || key.startsWith('nav.feed');
const feedKeys = (messages: Map<string, string>) => [...messages.keys()].filter(isFeedKey).sort();
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('the Feed’s strings', () => {
  it('has the same feed.* and nav.feed* keys in English and French, and some of each', () => {
    const english = feedKeys(locales.en);
    expect(english.length).toBeGreaterThan(80);
    expect(feedKeys(locales.fr)).toEqual(english);
    expect(english).toContain('nav.feed');
    expect(english).toContain('nav.feedDescription');
  });

  it('fills every string, in both locales', () => {
    for (const [name, messages] of Object.entries(locales)) {
      for (const key of feedKeys(messages)) {
        expect(messages.get(key)?.trim(), `${name}: ${key}`).toBeTruthy();
      }
    }
  });

  it('keeps the same placeholders in both locales for each key', () => {
    for (const key of feedKeys(locales.en)) {
      expect(placeholders(locales.fr.get(key)!), key).toEqual(placeholders(locales.en.get(key)!));
    }
  });

  it('has the plural forms wherever a count is shown, as many as the French needs', () => {
    // vue-i18n picks by count: 3 forms (none | one | other), or 2 (one | other).
    const forms: Record<string, number> = {
      'feed.post.replies': 3,
      'feed.post.like': 3,
      'feed.post.unseen': 2,
      'feed.thread.count': 3,
    };
    for (const [key, count] of Object.entries(forms)) {
      for (const [name, messages] of Object.entries(locales)) {
        const text = messages.get(key)!;
        expect(text.split('|'), `${name}: ${key}`).toHaveLength(count);
        // The count is printed in every form that is not the "none" one.
        for (const form of text.split('|').slice(count === 3 ? 1 : 0)) {
          expect(form, `${name}: ${key}`).toContain('{count}');
        }
      }
    }
  });

  it('has an error message for every refusal the page shows', () => {
    const shown = [
      'notFound',
      'notLinked',
      'banned',
      'notAllowed',
      'emptyText',
      'tooLong',
      'notPinnable',
      'rateLimited',
      'failed',
      'writingPaused',
      'unavailable',
      'sendFailed',
      'sentThenDeleted',
    ];
    for (const name of Object.keys(locales) as (keyof typeof locales)[]) {
      for (const key of shown) {
        expect(locales[name].get(`feed.errors.${key}`), `${name}: ${key}`).toBeTruthy();
      }
    }
    // A problem of the contract that the page has no message of its own for falls back to "failed".
    expect(FEED_PROBLEMS).toContain('pinLimit');
  });

  it('tells the seconds in the rate-limit message, in both languages', () => {
    for (const messages of Object.values(locales)) {
      expect(messages.get('feed.errors.rateLimited')).toContain('{seconds}');
    }
  });

  it('has the flag labels and audit action names in both locales', () => {
    for (const key of [
      'admin.flags.items.feed.label',
      'admin.flags.items.feed.description',
      'admin.flags.items.feed_serverApi.label',
      'admin.flags.items.feed_writing.label',
      'admin.activity.actions.minecraftFeedDelete',
      'admin.activity.actions.minecraftFeedPin',
      'admin.activity.actions.minecraftFeedUnpin',
      'admin.activity.actions.minecraftFeedAnnouncer',
      'admin.activity.actions.minecraftFeedPurge',
    ]) {
      for (const [name, messages] of Object.entries(locales)) {
        expect(messages.get(key)?.trim(), `${name}: ${key}`).toBeTruthy();
      }
    }
  });
});

describe('the keys the Feed’s code asks for', () => {
  const root = fileURLToPath(new URL('../../app/', import.meta.url));
  const files = [
    ...readdirSync(join(root, 'components/feed')).map((name) => `components/feed/${name}`),
    ...readdirSync(join(root, 'pages/minecraft/feed')).map(
      (name) => `pages/minecraft/feed/${name}`,
    ),
    'composables/useFeed.ts',
    'utils/feed.ts',
  ];
  const asked = new Set<string>();
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    for (const match of source.matchAll(/['"`](feed\.[\w.]+)['"`]/g)) {
      // `feed.writing` is a flag, which the error handling compares with.
      if (match[1] !== 'feed.writing') asked.add(match[1]!);
    }
  }

  it('finds the keys the code uses', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(asked.size).toBeGreaterThan(50);
  });

  it('has each literal key in both locales', () => {
    for (const key of asked) {
      for (const [name, messages] of Object.entries(locales)) {
        expect(messages.has(key), `${name}: ${key}`).toBe(true);
      }
    }
  });

  it('has the keys built from a name: tabs, empty states and errors', () => {
    for (const messages of Object.values(locales)) {
      for (const name of ['announcements', 'global']) {
        expect(messages.has(`feed.tabs.${name}`), name).toBe(true);
        expect(messages.has(`feed.empty.${name}.title`), name).toBe(true);
        expect(messages.has(`feed.empty.${name}.text`), name).toBe(true);
      }
      for (const problem of ['emptyText', 'tooLong']) {
        expect(messages.has(`feed.errors.${problem}`), problem).toBe(true);
      }
    }
  });

  it('leaves no feed string unused by the code, bar the ones built from a name', () => {
    const built = /^feed\.(tabs\.(announcements|global)|empty\.(announcements|global)\.|errors\.)/;
    const unused = feedKeys(locales.en).filter(
      (key) => !key.startsWith('nav.') && !asked.has(key) && !built.test(key),
    );
    expect(unused).toEqual([]);
  });
});

describe('the name of the association', () => {
  it('is "LNB" and never "La LNB", anywhere in either locale, in any case', () => {
    for (const [name, messages] of Object.entries(locales)) {
      for (const [key, text] of messages) {
        expect(text, `${name}: ${key}`).not.toMatch(/\bla\s+LNB\b/i);
      }
    }
  });

  it('is not spelled "La LNB" in the Feed’s own files either', () => {
    const files = [
      'docs/feed.md',
      'docs/feed-mod.md',
      'app/pages/minecraft/feed/index.vue',
      'app/pages/minecraft/feed/[id].vue',
    ];
    for (const file of files) {
      const source = readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8');
      expect(source, file).not.toMatch(/\bLa LNB\b/);
    }
  });
});
