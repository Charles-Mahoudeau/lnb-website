import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { modpackMod, modpackRetired, modpackState } from '~~/server/db/schema';
import { anticheatReportService } from '~~/server/services/anticheat/reports';
import { flagService } from '~~/server/services/flags';
import { modpackManifestService } from '~~/server/services/modpack/manifest';
import { modpackRetiredService } from '~~/server/services/modpack/retired';

import { admin, file, hash, session, setMode } from './anticheat-helpers';

import { MODPACK_RETIRED_MAX } from '#shared/schemas/modpack';

vi.mock('~~/server/lib/site', () => ({
  siteUrl: (path: string) => new URL(path, 'https://lnb.example').toString(),
}));
vi.mock('~~/server/services/modpack/loader-version', () => ({
  latestLoaderVersion: () => Promise.resolve('21.1.200'),
}));
vi.mock('~~/server/services/anticheat/lookup', () => ({
  anticheatLookupService: { kick: vi.fn() },
}));
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
  useStorage: () => ({}),
}));

const actor = { source: 'web', userId: admin } as const;
const DAY = 86_400_000;

const revision = async () =>
  (await db.select().from(modpackState).where(eq(modpackState.id, 1)))[0]!.revision;
const problemOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as { data?: { problem?: unknown } }).data?.problem;
  }
};
const find = async (name: string) =>
  (await modpackRetiredService.list()).items.find((item) => item.fileName === name)!;

beforeEach(async () => {
  await setMode('observe');
  await db.delete(modpackRetired);
});

describe('retired files', () => {
  it('adds files, skips a name already there, and raises the revision once', async () => {
    const before = await revision();
    const result = await modpackRetiredService.add({
      body: { items: [{ fileName: 'a.jar' }, { fileName: 'b.jar', sha512: hash() }], note: 'old' },
      actor,
    });
    expect(result).toEqual({ added: 2, skipped: 0 });
    expect(await revision()).toBe(before + 1);
    const again = await modpackRetiredService.add({
      body: { items: [{ fileName: 'a.jar' }, { fileName: 'c.jar' }], note: '' },
      actor,
    });
    expect(again).toEqual({ added: 1, skipped: 1 });
  });

  it('refuses a list that goes past the cap, and adds nothing', async () => {
    const items = Array.from({ length: MODPACK_RETIRED_MAX }, (_, i) => ({
      fileName: `m${String(i)}.jar`,
    }));
    await modpackRetiredService.add({ body: { items, note: '' }, actor });
    expect(
      await problemOf(
        modpackRetiredService.add({
          body: { items: [{ fileName: 'one-more.jar' }], note: '' },
          actor,
        }),
      ),
    ).toBe('tooManyRetired');
    expect((await modpackRetiredService.list()).items).toHaveLength(MODPACK_RETIRED_MAX);
  });

  it('edits and removes an entry, and refuses a name that is taken', async () => {
    await modpackRetiredService.add({
      body: { items: [{ fileName: 'a.jar' }, { fileName: 'b.jar' }], note: '' },
      actor,
    });
    const a = await find('a.jar');
    await modpackRetiredService.edit({ id: a.id, body: { note: 'why' }, actor });
    expect((await find('a.jar')).note).toBe('why');
    expect(
      await problemOf(modpackRetiredService.edit({ id: a.id, body: { fileName: 'b.jar' }, actor })),
    ).toBe('duplicate');
    await modpackRetiredService.remove({ id: a.id, actor });
    expect(await problemOf(modpackRetiredService.remove({ id: a.id, actor }))).toBe('notFound');
  });

  it('refuses to retire a file the pack uses now', async () => {
    const [row] = await db
      .insert(modpackMod)
      .values({ source: 'url', name: 'In use', pinnedFileName: 'in-use.jar' })
      .returning();
    const result = await modpackRetiredService.add({
      body: { items: [{ fileName: 'in-use.jar' }, { fileName: 'gone.jar' }], note: '' },
      actor,
    });
    expect(result).toEqual({ added: 1, skipped: 1 });
    expect((await modpackRetiredService.list()).items.map((i) => i.fileName)).toEqual(['gone.jar']);
    await db.delete(modpackMod).where(eq(modpackMod.id, row!.id));
  });

  it('puts the entries in the manifest, and leaves them out when the flag is off', async () => {
    const sha512 = hash();
    await modpackRetiredService.add({
      body: { items: [{ fileName: 'a.jar', sha512 }, { fileName: 'b.jar' }], note: '' },
      actor,
    });
    expect((await modpackManifestService.build()).retired).toEqual([
      { fileName: 'a.jar', sha512 },
      { fileName: 'b.jar' },
    ]);
    const off = vi.spyOn(flagService, 'isEnabled').mockResolvedValue(false);
    expect((await modpackManifestService.build()).retired).toEqual([]);
    off.mockRestore();
  });

  it('counts players from their latest report, by name and by hash', async () => {
    const keep = await session();
    const dropped = await session();
    const sha512 = hash();
    await anticheatReportService.submit({
      sessionId: keep.sessionId,
      files: [file({ filename: 'old.jar', sha512 }), file({ filename: 'named.jar' })],
    });
    // The second report no longer has old.jar: this player cleaned up.
    await anticheatReportService.submit({
      sessionId: dropped.sessionId,
      files: [file({ filename: 'old.jar', sha512 })],
    });
    await anticheatReportService.submit({ sessionId: dropped.sessionId, files: [file()] });
    await modpackRetiredService.add({
      body: {
        items: [
          { fileName: 'old.jar', sha512 },
          { fileName: 'named.jar' },
          { fileName: 'old-name.jar', sha512 },
          { fileName: 'other.jar', sha512: hash() },
        ],
        note: '',
      },
      actor,
    });
    const list = await modpackRetiredService.list();
    expect(list.counted).toBe(true);
    const players = Object.fromEntries(list.items.map((item) => [item.fileName, item.players]));
    expect(players).toEqual({ 'old.jar': 1, 'named.jar': 1, 'old-name.jar': 0, 'other.jar': 0 });
    const who = await modpackRetiredService.players((await find('old.jar')).id);
    expect(who.items.map((p) => p.userId)).toEqual([keep.userId]);
  });

  it('shows "safe to drop" after 14 days at zero, and null counts while the anticheat is off', async () => {
    await modpackRetiredService.add({ body: { items: [{ fileName: 'a.jar' }], note: '' }, actor });
    expect((await find('a.jar')).safeToDrop).toBe(false);
    await db.update(modpackRetired).set({ createdAt: new Date(Date.now() - 15 * DAY) });
    expect(await find('a.jar')).toMatchObject({ players: 0, safeToDrop: true });
    await setMode('off');
    expect(await find('a.jar')).toMatchObject({ players: null, safeToDrop: false, zeroDays: null });
    expect((await modpackRetiredService.list()).counted).toBe(false);
  });

  it('rejects names with a folder in the schema', async () => {
    const { modpackRetiredAddBody } = await import('#shared/schemas/modpack');
    for (const fileName of ['../x.jar', 'a/b.jar', 'a\\b.jar', '..', '']) {
      expect(modpackRetiredAddBody.safeParse({ items: [{ fileName }] }).success).toBe(false);
    }
    expect(modpackRetiredAddBody.safeParse({ items: [{ fileName: 'a b.jar' }] }).success).toBe(
      true,
    );
  });
});
