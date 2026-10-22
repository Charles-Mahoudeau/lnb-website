import { z } from 'zod';

/** Body of POST /api/link/approve, sent by the /link page. */
export const linkApproveBody = z.object({
  userCode: z.string().regex(/^\d{6}$/),
  // From the app, through /link?redirect_uri=...&state=...
  redirectUri: z.string().max(2000).optional(),
  state: z.string().max(500).optional(),
});

export type LinkApproveBody = z.infer<typeof linkApproveBody>;

/** Body of POST /api/link/deny, sent by the /link page. */
export const linkDenyBody = z.object({ userCode: z.string().regex(/^\d{6}$/) });
export type LinkDenyBody = z.infer<typeof linkDenyBody>;

/** Response of POST /api/link/approve. */
export const linkApproveResult = z.object({
  redirectTo: z.string().optional().describe('Where to send the person once linked, if anywhere.'),
});

/** Why a link was refused. The /link page shows a message for each one. */
export const LINK_PROBLEMS = [
  'unknown',
  'expired',
  'used',
  'schoolNotAllowed',
  'invalidRedirect',
  'tooManyAttempts',
  'failed',
  // Warden only: the account limit, an account someone already linked, or a code for another player.
  'accountLimitReached',
  'minecraftAccountTaken',
  'wrongAccount',
] as const;

export type LinkProblem = (typeof LINK_PROBLEMS)[number];
