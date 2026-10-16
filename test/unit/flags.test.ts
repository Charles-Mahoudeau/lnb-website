import { describe, expect, it } from 'vitest';

import en from '../../i18n/locales/en.json' with { type: 'json' };
import fr from '../../i18n/locales/fr.json' with { type: 'json' };
import {
  FLAG_DEFINITIONS,
  FLAG_KEYS,
  flagMessageKey,
  isFlagKey,
  resolveFlags,
} from '../../shared/flags.ts';

describe('feature flags', () => {
  it('has unique keys, and parents listed before their parts', () => {
    expect(new Set(FLAG_KEYS).size).toBe(FLAG_KEYS.length);
    FLAG_DEFINITIONS.forEach((flag, index) => {
      if (!('parent' in flag)) return;
      const parentIndex = FLAG_KEYS.indexOf(flag.parent);
      expect(parentIndex).toBeGreaterThanOrEqual(0);
      expect(parentIndex).toBeLessThan(index);
      expect(flag.key.startsWith(`${flag.parent}.`)).toBe(true);
    });
  });

  it('turns everything on by default', () => {
    expect(Object.values(resolveFlags(new Map())).every(Boolean)).toBe(true);
  });

  it('turns a single part off without touching its siblings or parent', () => {
    const flags = resolveFlags(new Map([['modList.voting', false]]));
    expect(flags['modList.voting']).toBe(false);
    expect(flags['modList.suggestions']).toBe(true);
    expect(flags.modList).toBe(true);
  });

  it('turns every part off with its parent', () => {
    const flags = resolveFlags(new Map([['warden', false]]));
    expect(flags.warden).toBe(false);
    expect(flags['warden.linking']).toBe(false);
    expect(flags['warden.serverApi']).toBe(false);
    expect(flags.modList).toBe(true);
  });

  it('keeps a part off when its parent comes back on', () => {
    const flags = resolveFlags(
      new Map([
        ['warden', true],
        ['warden.appeals', false],
      ]),
    );
    expect(flags['warden.appeals']).toBe(false);
    expect(flags['warden.linking']).toBe(true);
  });

  it('recognises only registered keys', () => {
    expect(isFlagKey('modList.voting')).toBe(true);
    expect(isFlagKey('modList.typo')).toBe(false);
  });

  it.each([
    ['en', en],
    ['fr', fr],
  ])('has a label and description in %s for every flag', (_locale, messages) => {
    const items = messages.admin.flags.items as Record<
      string,
      { label?: string; description?: string }
    >;
    for (const key of FLAG_KEYS) {
      const message = flagMessageKey(key);
      expect(items[message]?.label, key).toBeTruthy();
      expect(items[message]?.description, key).toBeTruthy();
    }
  });
});
