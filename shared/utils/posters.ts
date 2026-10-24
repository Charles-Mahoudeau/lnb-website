// Pure rules of the poster generator. See docs/posters.md.

export const POSTER_TEMPLATES = [
  'banner',
  'artTitle',
  'ticket',
  'labels',
  'collage',
  'badge',
] as const;
export type PosterTemplate = (typeof POSTER_TEMPLATES)[number];

/** Treatments of the art behind an Art title poster, made on the server. */
export const POSTER_TREATMENTS = ['duotone', 'darkMedium', 'darkStrong'] as const;
export type PosterTreatment = (typeof POSTER_TREATMENTS)[number];

/** The language printed on the poster, apart from the UI's. */
export const POSTER_LOCALES = ['fr', 'en'] as const;
export type PosterLocale = (typeof POSTER_LOCALES)[number];

export const POSTER_ACCENTS = ['violet', 'red'] as const;
export type PosterAccent = (typeof POSTER_ACCENTS)[number];

/** The parts of a poster that are violet or red, each on its own. A template has only some. */
export const POSTER_COLOR_ELEMENTS = [
  'kicker',
  'date',
  'label',
  'strap',
  'tape',
  'sticker',
  'tint',
] as const;
export type PosterColorElement = (typeof POSTER_COLOR_ELEMENTS)[number];
export type PosterColors = Record<PosterColorElement, PosterAccent>;

/** Collage takes this many photos. */
export const POSTER_PHOTOS_MAX = 3;

export interface PosterImage {
  key: string;
  focusX: number;
  focusY: number;
}

/** What a poster shows that can come from its event. */
export interface PosterFields {
  /** Line breaks are kept. */
  title: string;
  kicker: string;
  startsAt: string | null;
  place: string;
  /** Tenant IDs, for the logos. */
  schools: string[];
  art: PosterImage | null;
}
export type PosterField = keyof PosterFields;
export const POSTER_FIELDS = [
  'title',
  'kicker',
  'startsAt',
  'place',
  'schools',
  'art',
] as const satisfies readonly PosterField[];

/** Fields pinned on the poster: they no longer follow the event. */
export type PosterOverrides = Partial<PosterFields>;

/** The event values a poster follows. */
export interface PosterEventSource {
  name: string;
  typeNameEn: string;
  typeNameFr: string;
  startsAt: string;
  room: { name: string; details: string | null };
  schools: string[];
  banner: PosterImage | null;
}

export function placeLine(room: { name: string; details: string | null }): string {
  return room.details ? `${room.name}, ${room.details}` : room.name;
}

export function allColors(accent: PosterAccent): PosterColors {
  return Object.fromEntries(
    POSTER_COLOR_ELEMENTS.map((element) => [element, accent]),
  ) as PosterColors;
}

const EMPTY: PosterFields = {
  title: '',
  kicker: '',
  startsAt: null,
  place: '',
  schools: [],
  art: null,
};

/**
 * What a poster shows: each pinned field, else the event's value, else empty. The kicker
 * defaults to the event type's name in the poster's language.
 */
export function resolvePoster(
  overrides: PosterOverrides,
  source: PosterEventSource | null,
  locale: PosterLocale,
): { fields: PosterFields; pinned: Record<PosterField, boolean> } {
  const fromEvent: PosterFields = source
    ? {
        title: source.name,
        kicker: locale === 'fr' ? source.typeNameFr : source.typeNameEn,
        startsAt: source.startsAt,
        place: placeLine(source.room),
        schools: source.schools,
        art: source.banner,
      }
    : EMPTY;
  const fields = { ...fromEvent };
  const pinned = {} as Record<PosterField, boolean>;
  for (const field of POSTER_FIELDS) {
    pinned[field] = overrides[field] !== undefined;
    if (pinned[field]) (fields as Record<PosterField, unknown>)[field] = overrides[field];
  }
  return { fields, pinned };
}
