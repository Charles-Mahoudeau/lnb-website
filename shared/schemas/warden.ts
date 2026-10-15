import { z } from 'zod';

// Warden contracts, shared by the routes and the pages. See docs/warden.md.

/** A Minecraft UUID, with dashes, in lowercase. */
export const minecraftUuid = z
  .string()
  .regex(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i)
  .transform((uuid) => uuid.toLowerCase());

export const minecraftUsername = z.string().regex(/^\w{3,16}$/);

/** The label in <token>.mc.bde-teknantes.fr: 26 characters of lowercase base32. */
export const SERVER_TOKEN_LENGTH = 26;
const SERVER_TOKEN_PATTERN = new RegExp(`^[a-z2-7]{${String(SERVER_TOKEN_LENGTH)}}$`);
export function isServerToken(value: string): boolean {
  return SERVER_TOKEN_PATTERN.test(value);
}

/**
 * A token as the server read it from the player's address. Anything goes: a malformed token is
 * an unknown one, and the player should hear that rather than get a 400.
 */
export const serverTokenInput = z.string().max(253);

/** Minecraft staff behind an action sent by the server. Without one, it's the console. */
export const wardenIssuer = z.object({ uuid: minecraftUuid, username: minecraftUsername });
export type WardenIssuer = z.infer<typeof wardenIssuer>;

/** Body of POST /api/warden/server/link-requests. */
export const wardenLinkRequestBody = z.object({
  uuid: minecraftUuid,
  username: minecraftUsername,
  cracked: z.boolean(),
  // From the player's address. An unknown token just leaves the request unbound.
  token: serverTokenInput.optional(),
});
export type WardenLinkRequestBody = z.infer<typeof wardenLinkRequestBody>;

export interface WardenLinkRequest {
  requestId: string;
  userCode: string;
  expiresAt: string;
  expiresIn: number;
  interval: number;
  verificationUri: string;
  verificationUriComplete: string;
  boundToUser: boolean;
}

export type WardenLinkRequestStatus = 'pending' | 'approved' | 'denied' | 'expired';

/** The Minecraft account behind a code, for the /link page. */
export interface WardenLinkPreview {
  uuid: string;
  username: string;
  cracked: boolean;
  limit: { used: number; max: number };
}

export const wardenIdParams = z.object({ id: z.uuid() });
export const wardenUserCodeParams = z.object({ userCode: z.string().regex(/^\d{6}$/) });

/** Why a Warden request was refused, in `data.problem`. */
export const WARDEN_PROBLEMS = [
  'invalidUuid',
  'alreadyLinked',
  'crackedNotAllowed',
  'banned',
  'notFound',
  'notLinked',
  'notBanned',
  'issuerNotAllowed',
  'appealExists',
  'appealClosed',
] as const;
export type WardenProblem = (typeof WARDEN_PROBLEMS)[number];
