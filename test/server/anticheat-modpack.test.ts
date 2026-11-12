import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { anticheatFile, mod } from '~~/server/db/schema';
import { modAdminService } from '~~/server/services/mods/admin';
import { modListService } from '~~/server/services/mods/list';

import { admin, hash, setMode } from './anticheat-helpers';

// The mod services download icons and cache searches through Nitro, and the report service would
// start lookups on the real platforms.
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
  useStorage: () => ({}),
}));
vi.mock('~~/server/services/anticheat/lookup', () => ({
  anticheatLookupService: { kick: vi.fn() },
}));

const actor = { source: 'web', userId: admin } as const;

beforeEach(async () => {
  await setMode('enforce');
  await db.delete(mod);
});

afterAll(async () => {
  await db.delete(mod);
  await setMode('observe');
});

/** A file the platforms don't know, so only the official list can approve it. */
async function unknownFile(sha512 = hash()) {
  await db
    .insert(anticheatFile)
    .values({ sha512, kind: 'mod', filename: 'custom.jar', lookupState: 'notFound' });
  return sha512;
}

async function stored(sha512: string) {
  const [row] = await db.select().from(anticheatFile).where(eq(anticheatFile.sha512, sha512));
  return row!;
}

function manual(extra: { optional?: boolean; fileSha512?: string } = {}) {
  return modAdminService.addOfficial({
    body: {
      source: 'manual',
      name: 'Hand-made',
      pageUrl: 'https://example.org/hand-made',
      ...extra,
    },
    actor,
  });
}

describe('the official list and the anticheat', () => {
  it('scores a file again when a manual entry gets its hash, and when it loses it', async () => {
    const sha512 = await unknownFile();
    const { id } = await manual();
    expect((await stored(sha512)).breakdown?.path).not.toBe('approved');

    await modAdminService.edit({ modId: id, patch: { fileSha512: sha512 }, actor });
    const approved = await stored(sha512);
    expect(approved.breakdown?.path).toBe('approved');
    expect(approved.band).toBe('approved');
    expect(approved.score).toBe(100);

    await modAdminService.edit({ modId: id, patch: { fileSha512: null }, actor });
    expect((await stored(sha512)).breakdown?.path).not.toBe('approved');
  });

  it('scores a file again when an entry is added with its hash and when it is deleted', async () => {
    const sha512 = await unknownFile();
    const { id } = await manual({ fileSha512: sha512 });
    expect((await stored(sha512)).breakdown?.path).toBe('approved');

    await modAdminService.deleteOfficial({ modId: id, actor });
    expect((await stored(sha512)).breakdown?.path).not.toBe('approved');
  });

  it('only marks official mods optional and only ties manual ones to a hash', async () => {
    const { id } = await manual();
    await modAdminService.edit({ modId: id, patch: { optional: true }, actor });
    const rows = await modAdminService.list({ list: 'official', status: 'visible' });
    expect(rows[0]).toMatchObject({ optional: true, fileSha512: null });

    const [suggestion] = await db
      .insert(mod)
      .values({
        list: 'suggestion',
        source: 'modrinth',
        sourceId: 'abc',
        name: 'Suggested',
        pageUrl: 'https://modrinth.com/mod/abc',
      })
      .returning({ id: mod.id });
    await expect(
      modAdminService.edit({ modId: suggestion!.id, patch: { optional: true }, actor }),
    ).rejects.toMatchObject({ data: { problem: 'notOfficial' } });
    await expect(
      modAdminService.edit({ modId: suggestion!.id, patch: { fileSha512: hash() }, actor }),
    ).rejects.toMatchObject({ data: { problem: 'notManual' } });
  });

  it('never shows optional or the hash on the public page', async () => {
    const sha512 = hash();
    await manual({ optional: true, fileSha512: sha512 });
    const page = await modListService.page(undefined);
    expect(page.official).toHaveLength(1);
    const json = JSON.stringify(page);
    expect(json).not.toContain(sha512);
    expect(json).not.toContain('optional');
    expect(json).not.toContain('fileSha512');
  });
});
