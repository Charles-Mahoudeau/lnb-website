import { describe, expect, it } from 'vitest';

import en from '../../i18n/locales/en.json' with { type: 'json' };
import fr from '../../i18n/locales/fr.json' with { type: 'json' };
import { POSTER_PROBLEMS, posterBody } from '../../shared/schemas/posters.ts';
import {
  allColors,
  placeLine,
  POSTER_COLOR_ELEMENTS,
  POSTER_TEMPLATES,
  POSTER_TREATMENTS,
  resolvePoster,
} from '../../shared/utils/posters.ts';
import type { PosterEventSource } from '../../shared/utils/posters.ts';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ISEG = '8dab9574-4b8e-4eec-8e5e-791d6835fdea';

const source: PosterEventSource = {
  name: 'Smash Bros',
  typeNameEn: 'Tournament',
  typeNameFr: 'Tournoi',
  startsAt: '2026-12-17T18:30:00.000Z',
  room: { name: 'Salle 4', details: 'Campus Nantes' },
  schools: [EPITECH, ISEG],
  banner: { key: `${'a'.repeat(64)}.webp`, focusX: 0.5, focusY: 0.3 },
};

function body(patch: Record<string, unknown> = {}) {
  return {
    name: 'Smash',
    eventId: null,
    template: 'banner',
    treatment: null,
    locale: 'fr',
    overrides: {},
    content: {
      sticker: ['1v1', 'et', '2v2'],
      footer: '',
      qrEnabled: true,
      qrLabel: null,
      photos: [],
      colors: allColors('violet'),
    },
    qrUrl: 'https://example.com/signup',
    ...patch,
  };
}

describe('resolvePoster', () => {
  it('follows the event when nothing is pinned', () => {
    const { fields, pinned } = resolvePoster({}, source, 'fr');
    expect(fields).toEqual({
      title: 'Smash Bros',
      kicker: 'Tournoi',
      startsAt: source.startsAt,
      place: 'Salle 4, Campus Nantes',
      schools: [EPITECH, ISEG],
      art: source.banner,
    });
    expect(Object.values(pinned).every((p) => !p)).toBe(true);
  });

  it('takes the kicker in the poster’s language', () => {
    expect(resolvePoster({}, source, 'en').fields.kicker).toBe('Tournament');
  });

  it('keeps pinned fields, even empty ones', () => {
    const { fields, pinned } = resolvePoster(
      { title: 'Smash\nBros', schools: [], art: null, startsAt: null },
      source,
      'fr',
    );
    expect(fields.title).toBe('Smash\nBros');
    expect(fields.schools).toEqual([]);
    expect(fields.art).toBeNull();
    expect(fields.startsAt).toBeNull();
    expect(fields.place).toBe('Salle 4, Campus Nantes');
    expect(pinned).toMatchObject({ title: true, schools: true, art: true, place: false });
  });

  it('is empty without an event, apart from what is pinned', () => {
    const { fields } = resolvePoster({ title: 'Soirée jeux' }, null, 'fr');
    expect(fields).toEqual({
      title: 'Soirée jeux',
      kicker: '',
      startsAt: null,
      place: '',
      schools: [],
      art: null,
    });
  });

  it('leaves the details out of the place when there are none', () => {
    expect(placeLine({ name: 'Salle 4', details: null })).toBe('Salle 4');
  });
});

describe('posterBody', () => {
  it('accepts a full poster', () => {
    expect(posterBody.safeParse(body()).success).toBe(true);
  });

  it('refuses a QR address that is not https', () => {
    expect(posterBody.safeParse(body({ qrUrl: 'http://example.com' })).success).toBe(false);
  });

  it('takes a short link ID, empty for a random one, and refuses a malformed one', () => {
    expect(posterBody.parse(body({ qrShortId: ' Smash-Cup ' })).qrShortId).toBe('smash-cup');
    expect(posterBody.safeParse(body({ qrShortId: '' })).success).toBe(true);
    expect(posterBody.safeParse(body({ qrShortId: 'no spaces' })).success).toBe(false);
    expect(posterBody.safeParse(body({ qrShortId: 'x' })).success).toBe(false);
  });

  it('refuses more than three collage photos', () => {
    const photo = { key: `${'b'.repeat(64)}.jpg`, focusX: 0.5, focusY: 0.5 };
    const content = { ...body().content, photos: [photo, photo, null, photo] };
    expect(posterBody.safeParse(body({ content })).success).toBe(false);
  });

  it('refuses a school twice and an unknown school', () => {
    expect(posterBody.safeParse(body({ overrides: { schools: [ISEG, ISEG] } })).success).toBe(
      false,
    );
    expect(posterBody.safeParse(body({ overrides: { schools: ['nope'] } })).success).toBe(false);
  });
});

describe('poster messages', () => {
  it('has a message for every problem, template, treatment and part, in both languages', () => {
    for (const locale of [en, fr]) {
      const posters = locale.admin.posters;
      for (const problem of POSTER_PROBLEMS) expect(posters.errors[problem], problem).toBeTruthy();
      for (const template of POSTER_TEMPLATES) expect(posters.templates[template]).toBeTruthy();
      for (const treatment of POSTER_TREATMENTS)
        expect(posters.fields.treatments[treatment]).toBeTruthy();
      for (const element of POSTER_COLOR_ELEMENTS)
        expect(posters.fields.elements[element]).toBeTruthy();
    }
  });

  it('has the same keys in English and French', () => {
    const keys = (value: unknown, prefix = ''): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    expect(keys(fr.admin.posters)).toEqual(keys(en.admin.posters));
    expect(keys(fr.posters)).toEqual(keys(en.posters));
  });
});
