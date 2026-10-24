import { z } from 'zod';

import { eventImageInput } from './events.ts';
import {
  POSTER_ACCENTS,
  POSTER_LOCALES,
  POSTER_PHOTOS_MAX,
  POSTER_TEMPLATES,
  POSTER_TREATMENTS,
} from '../utils/posters.ts';
import { SCHOOLS } from '../utils/schools.ts';

// Poster contracts, shared by the routes and the pages. See docs/posters.md.

export const POSTER_PROBLEMS = ['posterNotFound', 'eventNotFound', 'qrUrlNeeded'] as const;
export type PosterProblem = (typeof POSTER_PROBLEMS)[number];

const isoDate = z.string().meta({ format: 'date-time' });

export const posterIdParams = z.object({ id: z.uuid() });

const accent = z.enum(POSTER_ACCENTS);
const tenantId = z.string().refine((tid) => tid in SCHOOLS);

/** An https address for the QR code. */
const destination = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => /^https:\/\/[^\s/]+\.[^\s/]+\S*$/.test(value));

/** Fields pinned on the poster. A missing one follows the event. */
export const posterOverrides = z
  .object({
    title: z.string().trim().max(120),
    kicker: z.string().trim().max(40),
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    place: z.string().trim().max(120),
    schools: z
      .array(tenantId)
      .max(Object.keys(SCHOOLS).length)
      .refine((ids) => new Set(ids).size === ids.length),
    art: eventImageInput.nullable(),
  })
  .partial();

/** What only the poster has. */
export const posterContent = z.object({
  sticker: z
    .tuple([z.string().trim().max(12), z.string().trim().max(12), z.string().trim().max(12)])
    .describe('Big, small and big lines. All empty: no sticker.'),
  footer: z.string().trim().max(120),
  qrEnabled: z.boolean(),
  qrLabel: z.string().trim().max(40).nullable().describe('Null: the default in its language.'),
  photos: z
    .array(eventImageInput.nullable())
    .max(POSTER_PHOTOS_MAX)
    .describe('Collage photos. Null: the main art.'),
  colors: z
    .object({
      kicker: accent,
      date: accent,
      label: accent,
      strap: accent,
      tape: accent,
      sticker: accent,
      tint: accent,
    })
    .describe('Violet or red, part by part. A template uses only some.'),
});
export type PosterContent = z.infer<typeof posterContent>;

/** POST /api/admin/posters and PUT /api/admin/posters/:id: the whole poster. */
export const posterBody = z.object({
  name: z.string().trim().min(1).max(80),
  eventId: z.uuid().nullable(),
  template: z.enum(POSTER_TEMPLATES),
  treatment: z.enum(POSTER_TREATMENTS).nullable().describe('Art title only.'),
  locale: z.enum(POSTER_LOCALES),
  overrides: posterOverrides,
  content: posterContent,
  qrUrl: destination
    .nullable()
    .describe("Where the QR code leads. Null: the event's page, which a standalone poster lacks."),
});
export type PosterBody = z.input<typeof posterBody>;

/** POST /api/admin/posters/:id/duplicate */
export const posterDuplicateBody = z.object({ name: z.string().trim().min(1).max(80) });

export const posterEventSource = z.object({
  name: z.string(),
  typeNameEn: z.string(),
  typeNameFr: z.string(),
  startsAt: isoDate,
  room: z.object({ name: z.string(), details: z.string().nullable() }),
  schools: z.array(z.string()),
  banner: eventImageInput.nullable(),
});

export const posterView = z.object({
  id: z.uuid(),
  name: z.string(),
  template: z.enum(POSTER_TEMPLATES),
  treatment: z.enum(POSTER_TREATMENTS).nullable(),
  treatedUrl: z.string().nullable().describe('The treated art, when there is a treatment.'),
  locale: z.enum(POSTER_LOCALES),
  overrides: posterOverrides,
  content: posterContent,
  event: z
    .object({
      id: z.uuid(),
      endsAt: isoDate,
      draft: z.boolean(),
      cancelled: z.boolean(),
      source: posterEventSource.describe('The values the poster follows.'),
    })
    .nullable()
    .describe('Null: a standalone poster, or one whose event was deleted.'),
  qr: z
    .object({
      linkId: z.uuid(),
      shortId: z.string(),
      url: z.string().describe('The short link, printed in the QR code.'),
      destinationUrl: z.string(),
      followsEvent: z.boolean().describe("It leads to the event's page."),
      clicks: z.number(),
    })
    .nullable()
    .describe('Null: no short link yet, or it was deleted.'),
  updatedAt: isoDate,
  updatedBy: z.string().nullable().describe('Who saved it last.'),
});
export type PosterView = z.infer<typeof posterView>;

export const posterList = z.object({ items: z.array(posterView) });
export const posterCreated = z.object({ id: z.uuid() });
