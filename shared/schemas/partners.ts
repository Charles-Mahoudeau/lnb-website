import { z } from 'zod';

// Partners page contracts, shared by the routes and the pages. See docs/partners.md.

export const PARTNER_PROBLEMS = [
  'partnerNotFound',
  'logoNotFound',
  'imageTooLarge',
  'imageUnreadable',
] as const;
export type PartnerProblem = (typeof PARTNER_PROBLEMS)[number];

/** The kinds, in the order the page shows them. */
export const PARTNER_KINDS = ['sponsor', 'game', 'prize'] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

/** The icon of each kind's tile on the page. */
export const PARTNER_KIND_ICONS: Record<PartnerKind, string> = {
  sponsor: 'i-lucide-handshake',
  game: 'i-lucide-gamepad-2',
  prize: 'i-lucide-gift',
};

export const partnerIdParams = z.object({ id: z.uuid() });
export const partnerLogoParams = z.object({ key: z.string().regex(/^[0-9a-f]{64}\.(webp|svg)$/) });

const localized = z.object({ en: z.string(), fr: z.string() });
export type PartnerText = z.infer<typeof localized>;

/** A link on a partner or the page: https only, or empty for none. */
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === '' || /^https:\/\/[^\s/]+\.[^\s/]+/.test(value))
  .nullable()
  .transform((value) => value || null);

// Public page

export const partnerPublicItem = z.object({
  id: z.uuid(),
  name: z.string(),
  description: localized,
  url: z.string().nullable(),
  logo: z.string().describe('The logo URL, served without sign-in.'),
});
export type PartnerPublicItem = z.infer<typeof partnerPublicItem>;

export const partnerPublicKind = z.object({
  kind: z.enum(PARTNER_KINDS),
  partners: z.array(partnerPublicItem),
});
export type PartnerPublicKind = z.infer<typeof partnerPublicKind>;

/** GET /api/partners */
export const partnerPublicView = z.object({
  kinds: z
    .array(partnerPublicKind)
    .describe('Kinds with at least one visible partner, in the page’s order.'),
  contactUrl: z
    .string()
    .nullable()
    .describe('Null while the partners.contact flag is off or no link is set.'),
});
export type PartnerPublicView = z.infer<typeof partnerPublicView>;

// Admin

export const partnerAdminItem = z.object({
  id: z.uuid(),
  kind: z.enum(PARTNER_KINDS),
  name: z.string(),
  description: localized,
  url: z.string().nullable(),
  logo: z.string(),
  logoKey: z.string(),
  visible: z.boolean(),
});
export type PartnerAdminItem = z.infer<typeof partnerAdminItem>;

/** GET /api/admin/partners */
export const partnerAdminView = z.object({
  partners: z
    .array(partnerAdminItem)
    .describe('Every partner, hidden ones too, by kind and order.'),
  contactUrl: z.string().nullable(),
});
export type PartnerAdminView = z.infer<typeof partnerAdminView>;

/** POST /api/admin/partners */
export const partnerBody = z.object({
  kind: z.enum(PARTNER_KINDS),
  name: z.string().trim().min(1).max(80),
  description: z.object({
    en: z.string().trim().min(1).max(300),
    fr: z.string().trim().max(300),
  }),
  url: httpsUrl,
  logoKey: z.string().regex(/^[0-9a-f]{64}\.(webp|svg)$/),
  visible: z.boolean(),
});
export type PartnerBody = z.input<typeof partnerBody>;

/** PATCH /api/admin/partners/:id. Another kind puts the partner last in it. */
export const partnerPatchBody = partnerBody
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type PartnerPatchBody = z.input<typeof partnerPatchBody>;

/** POST .../move: one step up or down inside its kind. */
export const partnerMoveBody = z.object({ direction: z.enum(['up', 'down']) });
export type PartnerMoveBody = z.infer<typeof partnerMoveBody>;

/** POST /api/admin/partners/logo */
export const partnerLogoView = z.object({
  logoKey: z.string(),
  logo: z.string().describe('The URL to preview it at.'),
});
export type PartnerLogoView = z.infer<typeof partnerLogoView>;

/** PATCH /api/admin/partners/settings */
export const partnerSettingsBody = z.object({
  contactUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) =>
        value === '' ||
        /^https:\/\/[^\s/]+\.[^\s/]+/.test(value) ||
        /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    )
    .nullable()
    .transform((value) => value || null),
});
export type PartnerSettingsBody = z.input<typeof partnerSettingsBody>;
export const partnerSettingsView = z.object({ contactUrl: z.string().nullable() });
