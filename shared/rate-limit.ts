// How strict rate limiting is. Admins pick the mode on /admin/rate-limit (docs/rate-limiting.md).

export const RATE_LIMIT_MODES = ['normal', 'event', 'off'] as const;
export type RateLimitMode = (typeof RATE_LIMIT_MODES)[number];

/** In event mode the per-IP ceilings are multiplied by this: a full room shares one IP. */
export const EVENT_IP_MULTIPLIER = 5;
