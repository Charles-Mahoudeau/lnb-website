import { z } from 'zod';

import {
  API_KEY_MAX_DAYS,
  API_KEY_OVERLAP_CHOICES,
  API_KEY_PERMISSIONS,
  API_KEY_STATUSES,
} from '../api-keys.ts';

// API key contracts, shared by the routes and the admin page. See docs/api-keys.md.

export const API_KEY_PROBLEMS = ['apiKeyNotFound', 'apiKeyNotUsable'] as const;
export type ApiKeyProblem = (typeof API_KEY_PROBLEMS)[number];

const isoDate = z.string().meta({ format: 'date-time' });

export const apiKeyIdParams = z.object({ id: z.uuid() });

/** POST /api/admin/api-keys */
export const apiKeyBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(''),
  expiresInDays: z.number().int().min(1).max(API_KEY_MAX_DAYS),
  permissions: z
    .array(z.enum(API_KEY_PERMISSIONS))
    .min(1)
    .max(API_KEY_PERMISSIONS.length)
    .transform((list) => [...new Set(list)]),
});
export type ApiKeyBody = z.input<typeof apiKeyBody>;

/** POST /api/admin/api-keys/:id/rotate */
export const apiKeyRotateBody = z.object({
  overlapDays: z
    .number()
    .int()
    .refine((days) => (API_KEY_OVERLAP_CHOICES as readonly number[]).includes(days))
    .describe('Days the old key keeps working.'),
});
export type ApiKeyRotateBody = z.input<typeof apiKeyRotateBody>;

export const apiKeyItem = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  prefix: z.string().describe('The first characters of the key, to tell keys apart.'),
  permissions: z.array(z.enum(API_KEY_PERMISSIONS)),
  status: z.enum(API_KEY_STATUSES),
  createdAt: isoDate,
  createdBy: z
    .string()
    .nullable()
    .describe('The admin who made it, if their account still exists.'),
  expiresAt: isoDate.describe('When it stops working. For a rotating key, the end of the overlap.'),
  lastUsedAt: isoDate.nullable(),
  calls7d: z.number().describe('Calls in the last 7 days.'),
});
export type ApiKeyItem = z.infer<typeof apiKeyItem>;

/** GET /api/admin/api-keys */
export const apiKeyList = z.object({
  keys: z.array(apiKeyItem).describe('Newest first.'),
  enabled: z.boolean().describe('False while the apiKeys flag is off: every key is refused.'),
});
export type ApiKeyList = z.infer<typeof apiKeyList>;

/** GET /api/admin/api-keys/:id */
export const apiKeyDetail = apiKeyItem.extend({
  routes: z
    .array(z.object({ route: z.string(), calls: z.number() }))
    .describe('Routes called in the last 7 days, most called first.'),
});
export type ApiKeyDetail = z.infer<typeof apiKeyDetail>;

/** The answer to creating or rotating a key. The secret is never shown again. */
export const apiKeyCreated = z.object({
  key: apiKeyItem,
  secret: z.string().describe('The whole key. It is shown once: only a hash is kept.'),
});
export type ApiKeyCreated = z.infer<typeof apiKeyCreated>;
