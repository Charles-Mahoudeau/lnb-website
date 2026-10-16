import { z } from 'zod';

import { FLAG_KEYS } from '../flags.ts';

// Feature flag contracts, shared by the /api/flags and /api/admin/flags routes and the pages.

export const flagKey = z.enum(FLAG_KEYS);

export const flagParams = z.object({ key: flagKey });

export const flagPatchBody = z.object({ enabled: z.boolean() });

/** GET /api/flags: the effective state of every flag. */
export const flagStates = z.record(flagKey, z.boolean());

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

export const adminFlag = z.object({
  key: flagKey,
  parent: flagKey.nullable(),
  /** The admin's own switch, whatever the parent says. */
  enabled: z.boolean(),
  /** What is applied: false when the parent is off too. */
  effective: z.boolean(),
  updatedAt: isoDate.nullable().describe('Null while the flag was never changed.'),
  updatedByName: z.string().nullable(),
});
export type AdminFlag = z.infer<typeof adminFlag>;

export const adminFlagList = z.object({ items: z.array(adminFlag) });
