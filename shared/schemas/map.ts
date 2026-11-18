import { z } from 'zod';

// Minecraft map page contracts, shared by the routes and the pages. See docs/map.md.

/** Where the map is while an admin hasn't set another address. */
export const DEFAULT_MAP_URL = 'https://mc.lnb.bde-teknantes.fr/map/';

/** Who can see the map: everyone, everyone from a date, or only admins until they open it. */
export const MAP_MODES = ['open', 'date', 'closed'] as const;
export const mapMode = z.enum(MAP_MODES);
export type MapMode = z.infer<typeof mapMode>;

/**
 * PATCH /api/admin/map. Every field is optional, so the address and the opening are saved
 * apart. An empty address or null goes back to the default. The `date` mode needs `opensAt`.
 */
export const mapSettingsBody = z
  .object({
    url: z
      .string()
      .trim()
      .max(500)
      .refine((value) => value === '' || /^https:\/\/[^\s/]+\.[^\s/]+\S*$/.test(value))
      .nullable()
      .transform((value) => value || null)
      .optional(),
    mode: mapMode.optional(),
    opensAt: z.iso.datetime().nullable().optional(),
  })
  .refine((body) => body.mode !== 'date' || !!body.opensAt, { path: ['opensAt'] });
export type MapSettingsBody = z.input<typeof mapSettingsBody>;

/**
 * GET /api/map. While the map is closed to visitors `url` is null, so the address never leaves
 * the server. An admin still gets it, with `locked` true, to preview the map.
 */
export const mapPublicView = z.object({
  url: z.string().nullable(),
  locked: z.boolean(),
  /** When the map opens (`date` mode only, null otherwise). */
  opensAt: z.string().nullable(),
  /** When the map was closed, for the progress on the wait page (null when unknown). */
  lockedAt: z.string().nullable(),
});
export type MapPublicView = z.infer<typeof mapPublicView>;

/** GET /api/map/status: whether the map answered 200, and the status it gave (null: no answer). */
export const mapStatusView = z.object({ ok: z.boolean(), status: z.number().nullable() });
export type MapStatusView = z.infer<typeof mapStatusView>;

/** GET and PATCH /api/admin/map */
export const mapAdminView = z.object({
  url: z.string().nullable(),
  defaultUrl: z.string(),
  mode: mapMode,
  opensAt: z.string().nullable(),
  lockedAt: z.string().nullable(),
});
export type MapAdminView = z.infer<typeof mapAdminView>;
