// Which limits apply to a request. Pure, so the table is easy to test and to change.

import { EVENT_IP_MULTIPLIER } from '../../shared/rate-limit.ts';
import type { RateLimitMode } from '../../shared/rate-limit.ts';

export interface RateRule {
  /** Names the counter. One rule, one counter per key. */
  name: string;
  points: number;
  windowSeconds: number;
  /** `user` falls back to the IP when nobody is signed in. */
  by: 'ip' | 'user';
}

// Epitech campuses share one public IP, and an event can put a hundred people on it. The IP
// ceilings are only there to stop floods; the tighter limits below are per account.
const API_PER_IP: RateRule = { name: 'api', points: 3000, windowSeconds: 60, by: 'ip' };
const GO_PER_IP: RateRule = { name: 'go', points: 240, windowSeconds: 60, by: 'ip' };
// One caller, the Minecraft server: heartbeats, logins and events from a single IP.
const WARDEN_SERVER_PER_IP: RateRule = {
  name: 'warden-server',
  points: 1200,
  windowSeconds: 60,
  by: 'ip',
};

// The mod before it has a device (link requests) and with one (join tickets, presence). The
// device limits are per device and live in the handlers; this is the IP ceiling.
const WARDEN_CLIENT_PER_IP: RateRule = {
  name: 'warden-client',
  points: 600,
  windowSeconds: 60,
  by: 'ip',
};
// Asking to link is open to anyone, so it is limited more tightly. A campus shares one IP, so
// this is higher than a single person needs.
const WARDEN_LINK_REQUEST: RateRule = {
  name: 'warden-link-request',
  points: 30,
  windowSeconds: 600,
  by: 'ip',
};

const SENSITIVE_WRITE: RateRule = {
  name: 'write-sensitive',
  points: 10,
  windowSeconds: 60,
  by: 'user',
};
const HEAVY_WRITE: RateRule = { name: 'write-heavy', points: 20, windowSeconds: 60, by: 'user' };
const ADMIN_WRITE: RateRule = { name: 'write-admin', points: 240, windowSeconds: 60, by: 'user' };
const WRITE: RateRule = { name: 'write', points: 60, windowSeconds: 60, by: 'user' };

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Minting a token or approving an app link: rare for a person, valuable to an attacker.
const SENSITIVE = [/^\/api\/link\/approve$/, /\/token$/];
// Uploads, imports and fan-out (push, bulk actions): expensive for the server.
const HEAVY = [
  /^\/api\/admin\/events\/images(\/import)?$/,
  /^\/api\/admin\/partners\/logo$/,
  /^\/api\/admin\/events\/[^/]+\/(announce|announce-resend|push-impact|bde-sync)$/,
  /^\/api\/admin\/users\/bulk$/,
];
const ADMIN_PREFIXES = ['/api/admin/', '/api/minecraft/admin/', '/api/warden/admin/'];

/** The rules for a request, all of which must pass. Empty when the route isn't limited here. */
export function rulesFor(method: string, path: string): RateRule[] {
  if (path.startsWith('/go/')) return [GO_PER_IP];
  if (!path.startsWith('/api/')) return [];
  // Better Auth has its own limits (docs/authentication.md), and the health check must answer.
  if (path.startsWith('/api/auth/') || path === '/api/health') return [];
  if (path.startsWith('/api/warden/server/')) return [WARDEN_SERVER_PER_IP];
  if (path.startsWith('/api/warden/client/')) {
    return method.toUpperCase() === 'POST' && path === '/api/warden/client/link-requests'
      ? [WARDEN_CLIENT_PER_IP, WARDEN_LINK_REQUEST]
      : [WARDEN_CLIENT_PER_IP];
  }

  const rules = [API_PER_IP];
  if (!MUTATING.has(method.toUpperCase())) return rules;
  if (SENSITIVE.some((pattern) => pattern.test(path))) return [...rules, SENSITIVE_WRITE];
  if (HEAVY.some((pattern) => pattern.test(path))) return [...rules, HEAVY_WRITE];
  if (ADMIN_PREFIXES.some((prefix) => path.startsWith(prefix))) return [...rules, ADMIN_WRITE];
  return [...rules, WRITE];
}

/**
 * The rules for a request under a mode. Event mode multiplies the per-IP ceilings, since a room
 * shares one IP, but not the link-request limit, which exists against abuse. Per-account limits
 * stay. Off applies none.
 */
export function rulesForMode(mode: RateLimitMode, method: string, path: string): RateRule[] {
  if (mode === 'off') return [];
  const rules = rulesFor(method, path);
  if (mode === 'normal') return rules;
  return rules.map((rule) =>
    rule.by === 'ip' && rule !== WARDEN_LINK_REQUEST
      ? { ...rule, name: `${rule.name}:event`, points: rule.points * EVENT_IP_MULTIPLIER }
      : rule,
  );
}
