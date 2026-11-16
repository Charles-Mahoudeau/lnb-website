import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { modpackMod, modpackState, user } from '~~/server/db/schema';
import { modpackService } from '~~/server/services/modpack';
import { modpackCheckService } from '~~/server/services/modpack/check';
import { downloadAndHash } from '~~/server/services/modpack/download';
import { resolveLatest, SourceUnavailableError } from '~~/server/services/modpack/latest';

// The mod catalog caches through Nitro, which isn't running here.
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: <T>(fn: T) => fn,
  useStorage: () => ({}),
}));
vi.mock('~~/server/services/modpack/latest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~~/server/services/modpack/latest')>()),
  resolveLatest: vi.fn(),
}));
vi.mock('~~/server/services/modpack/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~~/server/services/modpack/download')>()),
  downloadAndHash: vi.fn(),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ADMIN = 'modpack-check-admin';
const actor = { source: 'web', userId: ADMIN } as const;
const resolve = vi.mocked(resolveLatest);
const download = vi.mocked(downloadAndHash);

let counter = 0;
const unique = () => `${String(++counter)}-${Math.random().toString(16).slice(2)}`;
const revision = async () =>
  (await db.select().from(modpackState).where(eq(modpackState.id, 1)))[0]!.revision;
const rowOf = async (id: string) =>
  (await db.select().from(modpackMod).where(eq(modpackMod.id, id)))[0]!;

async function insert(values: Partial<typeof modpackMod.$inferInsert> & { name: string }) {
  const [row] = await db
    .insert(modpackMod)
    .values({ source: 'modrinth', sourceId: `p-${unique()}`, ...values })
    .returning();
  return row!;
}

const newFile = (version: string, sha512: string) => ({
  kind: 'file' as const,
  file: {
    version,
    fileName: `m-${version}.jar`,
    url: `https://x/${version}`,
    sha256: null,
    sha512,
    size: 10,
  },
});

async function problemOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { data?: { problem?: unknown } }).data?.problem;
  }
  return undefined;
}

beforeAll(async () => {
  await db
    .insert(user)
    .values({ id: ADMIN, name: 'Ada Lovelace', email: `${ADMIN}@epitech.eu`, tenantId: EPITECH })
    .onConflictDoNothing();
});

beforeEach(async () => {
  // Each test starts from an empty pack, so the counts are its own.
  await db.delete(modpackMod);
  resolve.mockReset();
  download.mockReset();
});

describe('check', () => {
  it('notes a newer file without touching what the manifest lists', async () => {
    const row = await insert({
      name: 'Sodium',
      pinnedVersion: '1',
      pinnedSha512: 'a',
      pinnedSize: 5,
    });
    resolve.mockResolvedValue(newFile('2', 'b'));
    const before = await revision();
    expect(await modpackCheckService.check()).toEqual({ checked: 1, updates: 1, failed: 0 });
    const after = await rowOf(row.id);
    expect(after).toMatchObject({
      pinnedVersion: '1',
      pinnedSha512: 'a',
      latestVersion: '2',
      latestSha512: 'b',
    });
    expect(after.latestCheckedAt).not.toBeNull();
    expect(await revision()).toBe(before);
    expect((await modpackService.viewOf(row.id)).status).toBe('update');
  });

  it('keeps what was known when a source cannot be reached', async () => {
    const row = await insert({
      name: 'Create',
      pinnedVersion: '1',
      pinnedSha512: 'a',
      latestVersion: '1',
      latestSha512: 'a',
    });
    resolve.mockRejectedValue(new SourceUnavailableError('down'));
    expect(await modpackCheckService.check()).toEqual({ checked: 1, updates: 0, failed: 1 });
    expect((await rowOf(row.id)).latestVersion).toBe('1');
  });

  it('skips uploaded mods', async () => {
    await insert({ name: 'Ours', source: 'upload', sourceId: null, pinnedSha512: 'a' });
    expect(await modpackCheckService.check()).toEqual({ checked: 0, updates: 0, failed: 0 });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('takes a custom link out of the manifest when its file changed, and puts it back when it returns', async () => {
    const row = await insert({
      name: 'Linked',
      source: 'url',
      sourceId: null,
      pinnedVersion: '1.4.2',
      pinnedUrl: 'https://example.com/a.jar',
      pinnedSha512: 'old',
    });
    download.mockResolvedValue({ sha256: 'n256', sha512: 'new', size: 7, fileName: 'a.jar' });
    const before = await revision();
    await modpackCheckService.check();
    expect(await rowOf(row.id)).toMatchObject({ attention: 'urlChanged', latestSha512: 'new' });
    expect(await revision()).toBe(before + 1);
    expect((await modpackService.viewOf(row.id)).status).toBe('attention');

    download.mockResolvedValue({ sha256: 'o256', sha512: 'old', size: 7, fileName: 'a.jar' });
    await modpackCheckService.check();
    expect((await rowOf(row.id)).attention).toBeNull();
    expect(await revision()).toBe(before + 2);
  });
});

describe('adopt', () => {
  it('pins the newest file and raises the revision once', async () => {
    const row = await insert({
      name: 'Sodium',
      pinnedVersion: '1',
      pinnedSha512: 'a',
      pinnedFileId: null,
      latestVersion: '2',
      latestFileName: 'm-2.jar',
      latestUrl: 'https://x/2',
      latestSha512: 'b',
      latestSize: 10,
    });
    const before = await revision();
    expect(await modpackCheckService.adopt({ id: row.id, actor })).toEqual({ adopted: 1 });
    expect(await rowOf(row.id)).toMatchObject({
      pinnedVersion: '2',
      pinnedSha512: 'b',
      pinnedUrl: 'https://x/2',
    });
    expect(await revision()).toBe(before + 1);
    expect((await modpackService.viewOf(row.id)).status).toBe('ok');
    expect(await problemOf(modpackCheckService.adopt({ id: row.id, actor }))).toBe(
      'nothingToAdopt',
    );
  });

  it('accepts the new file of a changed link', async () => {
    const row = await insert({
      name: 'Linked',
      source: 'url',
      sourceId: null,
      attention: 'urlChanged',
      pinnedVersion: '1',
      pinnedSha512: 'old',
      latestVersion: '1',
      latestUrl: 'https://example.com/a.jar',
      latestSha512: 'new',
    });
    await modpackCheckService.adopt({ id: row.id, actor });
    expect(await rowOf(row.id)).toMatchObject({ attention: null, pinnedSha512: 'new' });
  });

  it('refuses a mod with no newer file, and an unknown one', async () => {
    const row = await insert({ name: 'Plain', pinnedVersion: '1', pinnedSha512: 'a' });
    expect(await problemOf(modpackCheckService.adopt({ id: row.id, actor }))).toBe(
      'nothingToAdopt',
    );
    expect(await problemOf(modpackCheckService.adopt({ id: crypto.randomUUID(), actor }))).toBe(
      'notFound',
    );
  });

  it('adopts every update at once, leaving mods that need attention', async () => {
    const update = (name: string) =>
      insert({
        name,
        pinnedVersion: '1',
        pinnedSha512: `a-${name}`,
        latestVersion: '2',
        latestSha512: `b-${name}`,
      });
    const [one, two] = [await update('One'), await update('Two')];
    const flagged = await insert({
      name: 'Flagged',
      attention: 'downloadBlocked',
      pinnedVersion: '1',
      latestVersion: '2',
      latestSha512: 'z',
    });
    const before = await revision();
    expect(await modpackCheckService.adopt({ actor })).toEqual({ adopted: 2 });
    expect(await revision()).toBe(before + 1);
    expect((await rowOf(one.id)).pinnedVersion).toBe('2');
    expect((await rowOf(two.id)).pinnedVersion).toBe('2');
    expect((await rowOf(flagged.id)).pinnedSha512).toBeNull();
    expect(await modpackCheckService.adopt({ actor })).toEqual({ adopted: 0 });
    expect(await revision()).toBe(before + 1);
  });
});
