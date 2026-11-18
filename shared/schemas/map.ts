import { z } from 'zod';

// Minecraft map page contracts, shared by the routes and the pages. See docs/map.md.

/** Where the map is while an admin hasn't set another address. */
export const DEFAULT_MAP_URL = 'https://mc.lnb.bde-teknantes.fr/map/';

/** PATCH /api/admin/map. An empty value or null goes back to the default. */
export const mapSettingsBody = z.object({
  url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === '' || /^https:\/\/[^\s/]+\.[^\s/]+\S*$/.test(value))
    .nullable()
    .transform((value) => value || null),
});
export type MapSettingsBody = z.input<typeof mapSettingsBody>;

/** GET /api/map */
export const mapPublicView = z.object({ url: z.string() });
export type MapPublicView = z.infer<typeof mapPublicView>;

/** GET /api/map/status: whether the map answered 200, and the status it gave (null: no answer). */
export const mapStatusView = z.object({ ok: z.boolean(), status: z.number().nullable() });
export type MapStatusView = z.infer<typeof mapStatusView>;

/** GET and PATCH /api/admin/map */
export const mapAdminView = z.object({ url: z.string().nullable(), defaultUrl: z.string() });
export type MapAdminView = z.infer<typeof mapAdminView>;
