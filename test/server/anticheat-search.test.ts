import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { anticheatProject } from '~~/server/db/schema';
import { anticheatSearchService } from '~~/server/services/anticheat/search';

vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
  useStorage: () => ({}),
}));

const env = vi.hoisted(() => ({ CURSEFORGE_API_KEY: undefined as string | undefined }));
vi.mock('~~/server/lib/mods-env', () => ({
  modsEnv: () => ({ ...env, MODRINTH_USER_AGENT: 'test' }),
}));

// The platforms are never called for real: fetch is replaced in each test.
const modrinthHit = (id: string, title: string) => ({
  project_id: id,
  slug: title.toLowerCase().replace(/ /g, '-'),
  title,
  description: 'A project',
  author: 'someone',
  downloads: 1200,
  icon_url: 'https://cdn.modrinth.com/data/x/icon.png',
});

function stubFetch(handlers: { modrinth?: () => Response; curseforge?: () => Response }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const handler = url.includes('modrinth.com') ? handlers.modrinth : handlers.curseforge;
      return handler ? Promise.resolve(handler()) : Promise.reject(new Error('unreachable'));
    }),
  );
}

const json = (body: unknown) => new Response(JSON.stringify(body));
const adminId = () => `search-admin-${randomUUID()}`;

beforeEach(() => {
  env.CURSEFORGE_API_KEY = undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searching projects', () => {
  it('searches Modrinth for the kind asked and marks registered projects', async () => {
    const known = `known${randomUUID().slice(0, 8)}`;
    await db.insert(anticheatProject).values({
      kind: 'shader',
      name: 'Known shader',
      modrinthId: known,
      decision: 'approved',
    });
    stubFetch({
      modrinth: () =>
        json({ hits: [modrinthHit(known, 'Known shader'), modrinthHit('new1', 'New')] }),
    });

    const items = await anticheatSearchService.searchProjects({
      adminId: adminId(),
      query: 'shader',
      kind: 'shader',
    });

    const calls = vi.mocked(fetch).mock.calls as unknown as [string][];
    const requested = decodeURIComponent(calls[0]?.[0] ?? '');
    expect(requested).toContain('project_type:shader');
    expect(items.map((item) => [item.sourceId, item.registered])).toEqual([
      [known, true],
      ['new1', false],
    ]);
    expect(items[1]?.pageUrl).toBe('https://modrinth.com/shader/new');
    expect(items[1]?.iconUrl).toContain('/api/minecraft/mods/catalog-icon?src=');
  });

  it('still answers when only one platform is down', async () => {
    env.CURSEFORGE_API_KEY = 'key';
    stubFetch({
      curseforge: () =>
        json({
          data: [
            {
              id: 42,
              slug: 'a-pack',
              name: 'A pack',
              summary: '',
              downloadCount: 5,
              authors: [],
              links: { websiteUrl: '' },
              logo: null,
            },
          ],
        }),
    });

    const items = await anticheatSearchService.searchProjects({
      adminId: adminId(),
      query: 'pack',
      kind: 'resourcepack',
    });

    expect(items).toMatchObject([
      {
        source: 'curseforge',
        sourceId: '42',
        author: '',
        iconUrl: null,
        pageUrl: 'https://www.curseforge.com/minecraft/texture-packs/a-pack',
        registered: false,
      },
    ]);
  });

  it('refuses with unavailable when the platforms are down', async () => {
    stubFetch({ modrinth: () => new Response('no', { status: 500 }) });
    await expect(
      anticheatSearchService.searchProjects({ adminId: adminId(), query: 'mod', kind: 'mod' }),
    ).rejects.toMatchObject({ data: { problem: 'unavailable' } });
  });

  it('limits an admin to 30 searches a minute', async () => {
    stubFetch({ modrinth: () => json({ hits: [] }) });
    const id = adminId();
    for (let i = 0; i < 30; i++) {
      await anticheatSearchService.searchProjects({ adminId: id, query: 'mod', kind: 'mod' });
    }
    await expect(
      anticheatSearchService.searchProjects({ adminId: id, query: 'mod', kind: 'mod' }),
    ).rejects.toMatchObject({ data: { problem: 'rateLimited' } });
  });
});
