// Pure rules of the short links (/go/:id). See docs/short-links.md.

export const SHORT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// No look-alikes (0/o, 1/l), so a generated ID can be read out loud.
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A random short ID of 6 characters, from the readable alphabet. */
export function randomShortId(
  random: (max: number) => number = (max) => Math.floor(Math.random() * max),
) {
  let id = '';
  for (let i = 0; i < 6; i++) id += ID_ALPHABET.charAt(random(ID_ALPHABET.length));
  return id;
}

export type LinkAccess = 'any' | 'signed' | 'schools';

export interface GateLink {
  access: LinkAccess;
  /** Microsoft tenant IDs of the allowed schools, for `access: 'schools'`. */
  tenantIds: readonly string[];
}

export type GateDecision = 'open' | 'signIn' | 'wrongSchool';

/** Whether a visitor may follow a link: `tenantId` is null when signed out. */
export function decideAccess(link: GateLink, tenantId: string | null): GateDecision {
  if (link.access === 'any') return 'open';
  if (tenantId === null) return 'signIn';
  if (link.access === 'signed') return 'open';
  return link.tenantIds.includes(tenantId.toLowerCase()) ? 'open' : 'wrongSchool';
}

// Link previews (Teams, Discord, Slack, search engines) fetch a link without a person clicking.
const PREVIEW_AGENTS =
  /bot|crawler|spider|preview|facebookexternalhit|slackbot|discord|teams|skypeuripreview|whatsapp|telegram|curl|wget/i;

/** Whether a request comes from a link preview or a crawler, so it isn't counted as a click. */
export function isPreviewRequest(method: string, userAgent: string | undefined): boolean {
  return method !== 'GET' || !userAgent || PREVIEW_AGENTS.test(userAgent);
}
