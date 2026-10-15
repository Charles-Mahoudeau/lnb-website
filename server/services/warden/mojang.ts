import { defineCachedFunction } from 'nitropack/runtime';

import { refuse } from './shared';

// Premium account UUIDs come from Mojang's public API, from the username.

const TIMEOUT_MS = 5000;

/**
 * The Mojang profile for a username, or null when no account has it. Cached for 10 minutes, so
 * an admin typing a name doesn't send a request per keystroke. Mojang being down isn't cached.
 */
const fetchProfile = defineCachedFunction(
  async (username: string): Promise<{ uuid: string; username: string } | null> => {
    const url = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`;
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      refuse(502, 'mojangUnavailable');
    }
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) refuse(502, 'mojangUnavailable');
    const body = (await response.json()) as { id?: unknown; name?: unknown };
    if (typeof body.id !== 'string' || typeof body.name !== 'string') {
      refuse(502, 'mojangUnavailable');
    }
    const id = body.id.toLowerCase();
    return {
      uuid: `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`,
      username: body.name,
    };
  },
  {
    name: 'mojang-profile',
    maxAge: 10 * 60,
    // Usernames aren't case-sensitive for Mojang.
    getKey: (username: string) => username.toLowerCase(),
  },
);

export const mojang = { profile: fetchProfile };
