import { z } from 'zod';

export const avatarParams = z.object({
  key: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .describe('The SHA-256 of the photo, from the URL in `image`.'),
});
