import { describe, expect, it } from 'vitest';

import en from '../../i18n/locales/en.json' with { type: 'json' };
import fr from '../../i18n/locales/fr.json' with { type: 'json' };
import {
  INTEREST_TEXT_MAX,
  PARTNER_EVENT_PROBLEMS,
  PARTNER_GAME_KEYS,
  partnerEventParams,
  partnerInterestBody,
} from '../../shared/schemas/partner-events.ts';

describe('partner event params', () => {
  it('take lowercase slugs with hyphens', () => {
    expect(partnerEventParams.safeParse({ slug: 'arena-league-universite-2027' }).success).toBe(
      true,
    );
    for (const slug of ['', 'Arena', 'a_b', '-a', 'a-', 'a--b', 'a/b']) {
      expect(partnerEventParams.safeParse({ slug }).success).toBe(false);
    }
  });
});

describe('interest body', () => {
  it('fills in the defaults and trims the text', () => {
    const body = partnerInterestBody.parse({
      consent: true,
      games: [{ game: 'lol', inGameName: '  Fenrir#NTS ' }],
    });
    expect(body.games[0]).toEqual({
      game: 'lol',
      inGameName: 'Fenrir#NTS',
      rank: '',
      hidden: false,
    });
  });

  it('accepts an empty list, to withdraw', () => {
    expect(partnerInterestBody.safeParse({ consent: false, games: [] }).success).toBe(true);
  });

  it('refuses unknown games, duplicates, long texts and extra fields', () => {
    expect(
      partnerInterestBody.safeParse({ consent: true, games: [{ game: 'chess' }] }).success,
    ).toBe(false);
    expect(
      partnerInterestBody.safeParse({
        consent: true,
        games: [{ game: 'lol' }, { game: 'lol' }],
      }).success,
    ).toBe(false);
    expect(
      partnerInterestBody.safeParse({
        consent: true,
        games: [{ game: 'lol', rank: 'x'.repeat(INTEREST_TEXT_MAX + 1) }],
      }).success,
    ).toBe(false);
    expect(partnerInterestBody.safeParse({ consent: true, games: [], extra: 1 }).success).toBe(
      false,
    );
  });
});

describe('partner event messages', () => {
  // The page reads these keys: a missing one would show the key itself.
  const camel = (key: string) =>
    key.replaceAll(/-(\w)/g, (_, letter: string) => letter.toUpperCase());

  it('name every game and every problem in both languages', () => {
    for (const messages of [en, fr]) {
      for (const key of PARTNER_GAME_KEYS) {
        expect(messages.partnerEvents.games).toHaveProperty(camel(key));
      }
      for (const problem of [...PARTNER_EVENT_PROBLEMS, 'failed']) {
        expect(messages.partnerEvents.problems).toHaveProperty(problem);
      }
    }
  });
});
