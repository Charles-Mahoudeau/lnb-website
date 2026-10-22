import { z } from 'zod';

import { RATE_LIMIT_MODES } from '../rate-limit.ts';

// Rate limit mode contracts, shared by the /api/admin/rate-limit routes and the page.

export const rateLimitMode = z.enum(RATE_LIMIT_MODES);

export const rateLimitModeBody = z.object({ mode: rateLimitMode });

/** A date in responses: an ISO 8601 string in UTC. */
const isoDate = z.string().meta({ format: 'date-time' });

export const adminRateLimit = z.object({
  mode: rateLimitMode,
  updatedAt: isoDate.nullable().describe('Null while the mode was never changed.'),
  updatedByName: z.string().nullable(),
});
export type AdminRateLimit = z.infer<typeof adminRateLimit>;
