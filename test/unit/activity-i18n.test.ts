import { describe, expect, it } from 'vitest';

import en from '../../i18n/locales/en.json' with { type: 'json' };
import fr from '../../i18n/locales/fr.json' with { type: 'json' };
import { AUDIT_ACTIONS } from '../../shared/utils/audit-actions.ts';

// Every action has its own sentence in both languages: the page never falls back to a generic one.

const camel = (action: string) =>
  action.replace(/\.([a-z])/g, (_, char: string) => char.toUpperCase());

describe('activity sentences', () => {
  for (const [name, locale] of [
    ['English', en],
    ['French', fr],
  ] as const) {
    const sentences = locale.admin.activity.actions as Record<string, string>;

    it(`has one for every action in ${name}`, () => {
      for (const action of AUDIT_ACTIONS) {
        expect(sentences[camel(action)], action).toBeTruthy();
      }
    });

    it(`has none without an action in ${name}`, () => {
      const known = new Set(AUDIT_ACTIONS.map(camel));
      expect(Object.keys(sentences).filter((key) => !known.has(key))).toEqual([]);
    });
  }

  it('uses the same slots in both languages', () => {
    const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const a = en.admin.activity.actions as Record<string, string>;
    const b = fr.admin.activity.actions as Record<string, string>;
    for (const key of Object.keys(a)) expect(slots(b[key]!), key).toEqual(slots(a[key]!));
  });
});
