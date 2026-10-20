import { z } from 'zod';

import { SCHOOLS } from '../utils/schools.ts';
import { SHORT_ID_PATTERN } from '../utils/short-links.ts';

// Short link contracts, shared by the routes and the pages. See docs/short-links.md.

export const SHORT_LINK_PROBLEMS = ['shortLinkNotFound', 'shortIdTaken'] as const;
export type ShortLinkProblem = (typeof SHORT_LINK_PROBLEMS)[number];

/** Who can follow a link: anyone, any signed-in student, or students of some schools. */
export const LINK_ACCESS = ['any', 'signed', 'schools'] as const;

const isoDate = z.string().meta({ format: 'date-time' });

export const shortLinkIdParams = z.object({ id: z.uuid() });
export const shortLinkPublicParams = z.object({
  shortId: z.string().regex(SHORT_ID_PATTERN).max(40),
});

const tenantId = z.string().refine((tid) => tid in SCHOOLS);

/** An https destination. */
const destination = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => /^https:\/\/[^\s/]+\.[^\s/]+\S*$/.test(value));

const fields = {
  shortId: z
    .string()
    .trim()
    .toLowerCase()
    .max(40)
    .refine((value) => value === '' || (value.length >= 2 && SHORT_ID_PATTERN.test(value)))
    .describe('Leave it empty to get a random one.'),
  name: z.string().trim().min(1).max(80),
  destinationUrl: destination,
  access: z.enum(LINK_ACCESS),
  tenantIds: z.array(tenantId).max(Object.keys(SCHOOLS).length),
  recordClicks: z.boolean(),
  enabled: z.boolean(),
};

/** What links must satisfy together, for a whole body or the result of a patch. */
function consistent(link: { access?: string; tenantIds?: string[]; recordClicks?: boolean }) {
  if (link.access === 'schools' && !link.tenantIds?.length) return false;
  if (link.access === 'any' && link.recordClicks) return false;
  return true;
}

/** POST /api/admin/short-links */
export const shortLinkBody = z.object(fields).refine(consistent, {
  message: 'Schools need at least one school, and an open link can’t record who clicks.',
});
export type ShortLinkBody = z.input<typeof shortLinkBody>;

/** PATCH /api/admin/short-links/:id. The short ID can't change: printed links keep working. */
export const shortLinkPatchBody = z
  .object({ ...fields, shortId: z.never().optional() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type ShortLinkPatchBody = z.input<typeof shortLinkPatchBody>;

export const shortLinkListItem = z.object({
  id: z.uuid(),
  shortId: z.string(),
  name: z.string(),
  destinationUrl: z.string(),
  access: z.enum(LINK_ACCESS),
  tenantIds: z.array(z.string()),
  recordClicks: z.boolean(),
  enabled: z.boolean(),
  createdAt: isoDate,
  clicks: z.number().describe('Times it was followed.'),
  people: z.number().describe('People who followed it, when it records clicks. Otherwise 0.'),
});
export type ShortLinkListItem = z.infer<typeof shortLinkListItem>;

/** GET /api/admin/short-links */
export const shortLinkList = z.object({
  links: z.array(shortLinkListItem).describe('Newest first.'),
  baseUrl: z.string().describe('The site’s origin, so the page can show the full short URL.'),
});
export type ShortLinkList = z.infer<typeof shortLinkList>;

export const shortLinkClickPerson = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  school: z.string().nullable(),
  clicks: z.number(),
  lastAt: isoDate,
});

/** GET /api/admin/short-links/:id */
export const shortLinkDetail = shortLinkListItem.extend({
  signedInClicks: z.number(),
  anonymousClicks: z.number().describe('Clicks by visitors who were not signed in.'),
  refused: z.number().describe('Signed-in visitors turned away for the wrong school.'),
  days: z
    .array(
      z.object({
        day: z.string().describe('YYYY-MM-DD, Paris time.'),
        signedIn: z.number(),
        anonymous: z.number(),
      }),
    )
    .describe('The last 30 days, oldest first, with a row for each day.'),
  schools: z
    .array(z.object({ school: z.string(), people: z.number() }))
    .describe('People by school. Empty unless the link records clicks.'),
  recent: z
    .array(shortLinkClickPerson)
    .describe('The 50 people who clicked most recently. Empty unless the link records clicks.'),
  trackingOff: z.boolean().describe('True while the shortLinks.tracking flag is off.'),
});
export type ShortLinkDetail = z.infer<typeof shortLinkDetail>;

/** GET /api/short-links/:shortId: what the page behind a refused short link needs. */
export const shortLinkPublic = z.object({
  state: z.enum(['available', 'off']),
  access: z.enum(LINK_ACCESS),
  schools: z.array(z.string()).describe('Names of the allowed schools, for `access: schools`.'),
  recordClicks: z.boolean(),
});
export type ShortLinkPublic = z.infer<typeof shortLinkPublic>;
