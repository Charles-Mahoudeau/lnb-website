import { z } from 'zod';

import { SCHOOLS } from '../utils/schools.ts';

// Event contracts, shared by the routes and the pages. See docs/events.md.
// Responses are schemas too, so the API reference is built from the same definitions as the
// types. The server doesn't check its own responses with them.

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });
/** A date in requests: ISO 8601 with an offset or Z, such as 2026-11-20T19:00:00+01:00. */
const dateInput = z.iso.datetime({ offset: true });

export const EVENT_PROBLEMS = [
  'notFound',
  'roomNotFound',
  'typeNotFound',
  'duplicateName',
  'hasRegistrations',
  'cancelled',
  'started',
  'notYet',
  'closed',
  'wrongSchool',
  'full',
  'alreadyRegistered',
  'notRegistered',
  'userNotFound',
  'imageTooLarge',
  'imageUnreadable',
  'imageUnreachable',
  'imageNotFound',
  'providerUnavailable',
] as const;
export type EventProblem = (typeof EVENT_PROBLEMS)[number];

export const eventIdParams = z.object({ id: z.uuid() });

// Rooms

export const eventRoomView = z.object({
  id: z.uuid(),
  name: z.string(),
  details: z.string().nullable().describe('A campus or an address line, shown after the name.'),
  archived: z.boolean().describe('Archived rooms stay on their events but are no longer offered.'),
});
export type EventRoomView = z.infer<typeof eventRoomView>;

export const eventRoomList = z.object({ items: z.array(eventRoomView) });

/** POST /api/admin/event-rooms */
export const eventRoomBody = z.object({
  name: z.string().trim().min(1).max(80),
  details: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .transform((value) => value || null),
});
export type EventRoomBody = z.input<typeof eventRoomBody>;

/** PATCH /api/admin/event-rooms/:id */
export const eventRoomPatchBody = eventRoomBody
  .extend({ archived: z.boolean() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type EventRoomPatchBody = z.input<typeof eventRoomPatchBody>;

// Types

/** An icon from the Lucide set, by its Iconify name. */
export const lucideIcon = z.string().regex(/^i-lucide-[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const eventTypeView = z.object({
  id: z.uuid(),
  nameEn: z.string(),
  nameFr: z.string(),
  icon: lucideIcon,
  archived: z.boolean().describe('Archived types stay on their events but are no longer offered.'),
});
export type EventTypeView = z.infer<typeof eventTypeView>;

export const eventTypeList = z.object({ items: z.array(eventTypeView) });

/** POST /api/admin/event-types */
export const eventTypeBody = z.object({
  nameEn: z.string().trim().min(1).max(40),
  nameFr: z.string().trim().min(1).max(40),
  icon: lucideIcon,
});
export type EventTypeBody = z.input<typeof eventTypeBody>;

/** PATCH /api/admin/event-types/:id */
export const eventTypePatchBody = eventTypeBody
  .extend({ archived: z.boolean() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type EventTypePatchBody = z.input<typeof eventTypePatchBody>;

// Events, for managers

export const EVENT_NAME_MAX = 120;
export const EVENT_DESCRIPTION_MAX = 10_000;

/** The BDE website's own rules, checked when an event is pushed there. */
export const BDE_RULES = { nameMin: 3, nameMax: 100, descriptionMin: 10, locationMin: 3 } as const;

const schoolId = z
  .string()
  .refine((tid) => tid in SCHOOLS)
  .describe("A school's Microsoft tenant ID.");

// Images

const eventImages = z
  .object({
    banner: z.string().describe('1920 × 620, for the event page and the home hero.'),
    thumb: z.string().describe('16:9, for agenda rows.'),
    embed: z.string().describe('1200 × 630, for social embeds and the BDE website.'),
  })
  .nullable()
  .describe('Null: no art. Pages show the flat fallback.');

/** A stored image: the SHA-256 of its bytes, then its format. */
export const imageKey = z.string().regex(/^[0-9a-f]{64}\.(?:webp|jpg)$/);
export const mediaParams = z.object({ key: imageKey });

/** An image picked for an event, and the point its crops are centered on (0 to 1). */
export const eventImageInput = z.object({
  key: imageKey,
  focusX: z.number().min(0).max(1),
  focusY: z.number().min(0).max(1),
});
export type EventImageInput = z.infer<typeof eventImageInput>;

export const eventStoredImage = z.object({
  key: imageKey,
  url: z.string(),
  width: z.number(),
  height: z.number(),
});
export type EventStoredImage = z.infer<typeof eventStoredImage>;

/** POST /api/admin/events/images/import */
export const eventImageImportBody = z.object({
  source: z.enum(['url', 'steamgriddb']),
  url: z.url({ protocol: /^https$/ }).max(2000),
});

export const imageProviderName = z.enum(['steamgriddb']);
export const imageProviderParams = z.object({ provider: imageProviderName });
export const imageProviderGameParams = z.object({
  provider: imageProviderName,
  gameId: z.string().regex(/^\d{1,12}$/),
});
export const imageSearchQuery = z.object({ q: z.string().trim().min(2).max(100) });
export const imageListQuery = z.object({ kind: z.enum(['banners', 'covers']).default('banners') });
export const imageThumbQuery = z.object({ url: z.url({ protocol: /^https$/ }).max(2000) });

export const imageProviders = z.object({
  steamgriddb: z.boolean().describe('Set up, and its flag on.'),
});
export const providerGames = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string(), year: z.number().nullable() })),
});
export type ProviderGames = z.infer<typeof providerGames>;
export const providerImages = z.object({
  items: z.array(
    z.object({
      url: z.string(),
      thumb: z.string().describe('Through /api/admin/events/images/thumb.'),
      width: z.number(),
      height: z.number(),
      author: z.string().nullable(),
    }),
  ),
});
export type ProviderImages = z.infer<typeof providerImages>;

/** POST /api/admin/events and PUT /api/admin/events/:id: the whole event, every time. */
export const eventBody = z
  .object({
    name: z.string().trim().min(1).max(EVENT_NAME_MAX),
    description: z
      .string()
      .trim()
      .min(1)
      .max(EVENT_DESCRIPTION_MAX)
      .describe('Markdown, without raw HTML or images.'),
    roomId: z.uuid(),
    typeId: z.uuid(),
    schools: z
      .array(schoolId)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length)
      .describe('The schools whose students can register.'),
    startsAt: dateInput,
    endsAt: dateInput,
    capacity: z
      .int()
      .positive()
      .max(10_000)
      .nullable()
      .describe('Null: no limit. Past it, registrations join the waitlist.'),
    registrationOpensAt: dateInput.nullable().describe('Null: open from publication.'),
    registrationClosesAt: dateInput.nullable().describe('Null: open until the start.'),
    price: z.int().min(0).max(1000).nullable().describe('Whole euros, informational. Null: free.'),
    hidden: z.boolean().describe('A draft: only events managers see it.'),
    bdeSync: z.boolean().describe('Publish the event on the BDE website too.'),
    banner: eventImageInput.nullable().default(null).describe('Null: no art.'),
    embed: eventImageInput
      .nullable()
      .default(null)
      .describe('For social embeds and the BDE website. Null: cropped from the banner.'),
  })
  .superRefine((body, ctx) => {
    const time = (iso: string) => new Date(iso).getTime();
    if (time(body.endsAt) <= time(body.startsAt)) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'endsBeforeStart' });
    }
    if (body.registrationClosesAt && time(body.registrationClosesAt) > time(body.startsAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['registrationClosesAt'],
        message: 'closesAfterStart',
      });
    }
    if (
      body.registrationOpensAt &&
      body.registrationClosesAt &&
      time(body.registrationOpensAt) >= time(body.registrationClosesAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['registrationOpensAt'],
        message: 'opensAfterClose',
      });
    }
    if (
      body.bdeSync &&
      (body.name.length < BDE_RULES.nameMin || body.name.length > BDE_RULES.nameMax)
    ) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'bdeName' });
    }
    if (body.bdeSync && body.description.length < BDE_RULES.descriptionMin) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'bdeDescription' });
    }
  });
export type EventBody = z.input<typeof eventBody>;

/** POST /api/admin/events/:id/duplicate: the copy's dates. The registration window follows. */
export const eventDuplicateBody = z
  .object({ startsAt: dateInput, endsAt: dateInput })
  .refine((body) => new Date(body.endsAt) > new Date(body.startsAt), { path: ['endsAt'] });
export type EventDuplicateBody = z.input<typeof eventDuplicateBody>;

export const eventBdeStatus = z
  .enum(['synced', 'pending', 'failed'])
  .nullable()
  .describe('Null: never pushed, or deleted there.');

/** The counts of an event's registrations. */
const eventCounts = z.object({
  registered: z.number(),
  waitlist: z.number(),
});

export const eventAdminRow = z.object({
  id: z.uuid(),
  name: z.string(),
  startsAt: isoDate,
  endsAt: isoDate,
  hidden: z.boolean(),
  cancelledAt: isoDate.nullable(),
  room: eventRoomView,
  type: eventTypeView,
  capacity: z.number().nullable(),
  counts: eventCounts,
  bdeSync: z.boolean(),
  bdeStatus: eventBdeStatus,
});
export type EventAdminRow = z.infer<typeof eventAdminRow>;

export const eventAdminList = z.object({ items: z.array(eventAdminRow) });

/** GET /api/admin/events query. */
export const eventAdminQuery = z.object({
  tab: z
    .enum(['upcoming', 'drafts', 'past'])
    .default('upcoming')
    .describe('`upcoming` and `past` are published events, split at their end. `drafts`: hidden.'),
});
export type EventAdminQuery = z.input<typeof eventAdminQuery>;

const eventImageView = eventImageInput.extend({ url: z.string() }).nullable();

export const eventAdminView = eventAdminRow.extend({
  description: z.string(),
  banner: eventImageView,
  embed: eventImageView,
  images: eventImages,
  schools: z.array(z.string()),
  registrationOpensAt: isoDate.nullable(),
  registrationClosesAt: isoDate.nullable(),
  price: z.number().nullable(),
  bde: z.object({
    attempts: z.number(),
    nextAttemptAt: isoDate.nullable(),
    lastError: z.record(z.string(), z.unknown()).nullable(),
    pageUrl: z.string().nullable().describe("The event's page on the BDE website."),
  }),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type EventAdminView = z.infer<typeof eventAdminView>;

export const eventCreated = z.object({ id: z.uuid() });

// Events, for everyone

/** GET /api/events query. */
export const eventQuery = z.object({
  when: z
    .enum(['upcoming', 'past'])
    .default('upcoming')
    .describe('`upcoming`: not over yet, soonest first. `past`: over, latest first.'),
  type: z.uuid().optional(),
  school: schoolId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});
export type EventQuery = z.input<typeof eventQuery>;

export const eventSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  startsAt: isoDate,
  endsAt: isoDate,
  cancelled: z.boolean(),
  room: z.object({ name: z.string(), details: z.string().nullable() }),
  type: z.object({ id: z.uuid(), nameEn: z.string(), nameFr: z.string(), icon: z.string() }),
  schools: z
    .array(z.string())
    .describe('The tenant IDs of the schools whose students can register.'),
  capacity: z.number().nullable(),
  registered: z.number(),
  images: eventImages,
  me: z
    .enum(['registered', 'waitlist'])
    .nullable()
    .describe("The caller's registration. Null when signed out or not registered."),
});
export type EventSummary = z.infer<typeof eventSummary>;

export const eventList = z.object({ items: z.array(eventSummary) });
export type EventList = z.infer<typeof eventList>;

export const eventView = eventSummary.extend({
  descriptionHtml: z.string().describe('The description, rendered. No raw HTML, no images.'),
  summary: z.string().describe('The start of the description as plain text, for meta tags.'),
  price: z.number().nullable(),
  registrationOpensAt: isoDate.nullable(),
  registrationClosesAt: isoDate.nullable(),
  hidden: z.boolean().describe('A draft. Only events managers get one.'),
  registration: z.object({
    state: z
      .enum(['cancelled', 'started', 'notYet', 'closed', 'wrongSchool', 'full', 'open'])
      .describe(
        'Whether the caller can register now. `full` still takes waitlist sign-ups. Signed out, the school is not checked.',
      ),
    waitlist: z.number().describe('People on the waitlist.'),
    me: z
      .object({
        status: z.enum(['registered', 'waitlist']),
        position: z.number().nullable().describe('Place on the waitlist, from 1.'),
      })
      .nullable(),
  }),
  attendees: z
    .array(z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }))
    .nullable()
    .describe('The first 6 people registered. Null when signed out: names are for members only.'),
});
export type EventView = z.infer<typeof eventView>;
export type RegistrationState = EventView['registration']['state'];

/** POST /api/events/:id/registration */
export const eventRegistrationResult = eventView.shape.registration.shape.me.unwrap();
export type EventRegistrationResult = z.infer<typeof eventRegistrationResult>;

/** GET /api/account/events: the caller's registrations, upcoming soonest first, then past. */
export const myEventList = z.object({
  upcoming: z.array(eventSummary),
  past: z.array(eventSummary),
});
export type MyEventList = z.infer<typeof myEventList>;

// Registrations, for managers

export const eventRegistrationParams = z.object({
  id: z.uuid(),
  userId: z.string().min(1).max(64),
});

export const eventRegistrationRow = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  school: z.string().nullable(),
  status: z.enum(['registered', 'waitlist']),
  position: z.number().nullable().describe('Place on the waitlist, from 1.'),
  registeredAt: isoDate,
  addedBy: z.string().nullable().describe('The manager who added them, by name.'),
});
export type EventRegistrationRow = z.infer<typeof eventRegistrationRow>;

export const eventRegistrationList = z.object({ items: z.array(eventRegistrationRow) });
export type EventRegistrationList = z.infer<typeof eventRegistrationList>;

/** POST /api/admin/events/:id/registrations */
export const eventRegistrationAddBody = z.object({
  userId: z.string().min(1).max(64),
  force: z.boolean().default(false).describe('Register even past the limit.'),
});
export type EventRegistrationAddBody = z.input<typeof eventRegistrationAddBody>;

/** GET /api/admin/events/users */
export const eventUserQuery = z.object({ q: z.string().trim().min(2).max(100) });

export const eventUserOption = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  school: z.string().nullable(),
});
export const eventUserOptions = z.object({ items: z.array(eventUserOption) });
export type EventUserOption = z.infer<typeof eventUserOption>;
