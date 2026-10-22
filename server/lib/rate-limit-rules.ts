// Which limits apply to a request. Pure, so the table is easy to test and to change.

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

  const rules = [API_PER_IP];
  if (!MUTATING.has(method.toUpperCase())) return rules;
  if (SENSITIVE.some((pattern) => pattern.test(path))) return [...rules, SENSITIVE_WRITE];
  if (HEAVY.some((pattern) => pattern.test(path))) return [...rules, HEAVY_WRITE];
  if (ADMIN_PREFIXES.some((prefix) => path.startsWith(prefix))) return [...rules, ADMIN_WRITE];
  return [...rules, WRITE];
}
