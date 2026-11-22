import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  modpackMod,
  modpackRetired,
  modpackState,
  user,
  audit as auditLog,
} from '~~/server/db/schema';
import { fileService } from '~~/server/services/files';
import { modpackService, statusOf } from '~~/server/services/modpack';

// The mod catalog caches through Nitro, which isn't running here.
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: <T>(fn: T) => fn,
  useStorage: () => ({}),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ADMIN = 'modpack-test-admin';
const actor = { source: 'web', userId: ADMIN } as const;

let dir: string;
let counter = 0;
const unique = () =>
  `${String(++counter)}-${String(Date.now())}-${Math.random().toString(16).slice(2)}`;

async function problemOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { data?: { problem?: unknown } }).data?.problem;
  }
  return undefined;
}

const revision = async () =>
  (await db.select().from(modpackState).where(eq(modpackState.id, 1)))[0]!.revision;

async function uploadJar(kind: 'mod' | 'asset' = 'mod') {
  const bytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(unique())]);
  return fileService.ingest({
    body: Readable.from([bytes]),
    name: kind === 'mod' ? 'tweak.jar' : 'notes.txt',
    kind,
    contentLength: bytes.length,
    actorUserId: ADMIN,
  });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lnb-modpack-'));
  process.env.FILES_DIR = dir;
  await db
    .insert(user)
    .values({ id: ADMIN, name: 'Ada Lovelace', email: `${ADMIN}@epitech.eu`, tenantId: EPITECH })
    .onConflictDoNothing();
});

afterAll(async () => {
  delete process.env.FILES_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('modpackService', () => {
  it('adds an uploaded mod pinned to the library file, and bumps the revision', async () => {
    const file = await uploadJar();
    const before = await revision();
    const { id } = await modpackService.add({
      body: {
        source: 'upload',
        name: 'LNB Tweaks',
        version: '0.5.3',
        fileId: file.id,
        side: 'server',
      },
      actor,
    });
    const view = await modpackService.viewOf(id);
    expect(view).toMatchObject({
      name: 'LNB Tweaks',
      source: 'upload',
      side: 'server',
      status: 'ok',
      pinnedFileId: file.id,
      pinned: { version: '0.5.3', sha256: file.sha256, sha512: file.sha512, size: file.size },
    });
    expect(view.pinned?.url).toBe(file.url);
    expect(await revision()).toBe(before + 1);
    const audit = await db.select().from(auditLog);
    expect(
      audit.some((row) => row.action === 'minecraft.modpack.add' && row.data.modId === id),
    ).toBe(true);
  });

  it('refuses a file that is not a mod jar', async () => {
    const asset = await uploadJar('asset');
    expect(
      await problemOf(
        modpackService.add({
          body: { source: 'upload', name: 'Notes', version: '1', fileId: asset.id },
          actor,
        }),
      ),
    ).toBe('notModFile');
    expect(
      await problemOf(
        modpackService.add({
          body: { source: 'upload', name: 'Ghost', version: '1', fileId: crypto.randomUUID() },
          actor,
        }),
      ),
    ).toBe('fileNotFound');
  });

  it('keeps a file in use from being deleted, and lists what uses it', async () => {
    const file = await uploadJar();
    const { id } = await modpackService.add({
      body: { source: 'upload', name: 'In Use Mod', version: '1', fileId: file.id },
      actor,
    });
    expect(await problemOf(fileService.remove({ id: file.id, actorUserId: ADMIN }))).toBe(
      'fileInUse',
    );
    expect((await fileService.list()).items.find((item) => item.id === file.id)?.usedBy).toEqual([
      'In Use Mod',
    ]);
    await modpackService.remove({ id, actor });
    await fileService.remove({ id: file.id, actorUserId: ADMIN });
  });

  it('edits the details, and the version only of typed mods', async () => {
    const file = await uploadJar();
    const { id } = await modpackService.add({
      body: { source: 'upload', name: 'Edit Me', version: '1', fileId: file.id },
      actor,
    });
    const before = await revision();
    await modpackService.edit({
      id,
      patch: { name: 'Edited', side: 'client', optional: true, version: '2' },
      actor,
    });
    const view = await modpackService.viewOf(id);
    expect(view).toMatchObject({ name: 'Edited', side: 'client', optional: true });
    expect(view.pinned?.version).toBe('2');
    expect(await revision()).toBe(before + 1);
    await modpackService.edit({ id, patch: {}, actor });
    expect(await revision()).toBe(before + 1);
  });

  it('switches a flagged mod to a library jar and clears the flag', async () => {
    const [row] = await db
      .insert(modpackMod)
      .values({
        source: 'curseforge',
        sourceId: `cf-${unique()}`,
        name: 'Blocked Mod',
        attention: 'downloadBlocked',
        pinnedVersion: '6.0.1',
      })
      .returning();
    expect(statusOf(row!)).toBe('attention');
    const file = await uploadJar();
    await modpackService.pinFile({
      id: row!.id,
      body: { fileId: file.id, version: '6.0.1' },
      actor,
    });
    const view = await modpackService.viewOf(row!.id);
    expect(view).toMatchObject({ status: 'ok', attention: null, source: 'curseforge' });
    expect(view.pinned?.sha512).toBe(file.sha512);
  });

  it('shows an update when the latest file differs from the pinned one', async () => {
    const [row] = await db
      .insert(modpackMod)
      .values({
        source: 'modrinth',
        sourceId: `mr-${unique()}`,
        name: 'Aging Mod',
        pinnedVersion: '1',
        pinnedSha512: 'a',
        latestVersion: '2',
        latestSha512: 'b',
      })
      .returning();
    expect(statusOf(row!)).toBe('update');
    expect(statusOf({ ...row!, latestSha512: 'a' })).toBe('ok');
  });

  it('removes a mod, and answers 404 for an unknown one', async () => {
    const file = await uploadJar();
    const { id } = await modpackService.add({
      body: { source: 'upload', name: 'Short Lived', version: '1', fileId: file.id },
      actor,
    });
    // Earlier tests removed mods with the same file name.
    await db.delete(modpackRetired);
    await modpackService.remove({ id, actor });
    expect(await problemOf(modpackService.viewOf(id))).toBe('notFound');
    expect(await problemOf(modpackService.remove({ id, actor }))).toBe('notFound');
    // Its file is retired, with the hash, for launchers that never kept a journal.
    const [retired] = await db
      .select()
      .from(modpackRetired)
      .where(eq(modpackRetired.sha512, file.sha512.toLowerCase()));
    expect(retired).toMatchObject({ fileName: 'tweak.jar' });
  });

  it('lists the size of the pack without the mods that need attention', async () => {
    const { totalBytes, items } = await modpackService.list();
    const expected = items.reduce(
      (sum, item) => sum + (item.status === 'attention' ? 0 : (item.pinned?.size ?? 0)),
      0,
    );
    expect(totalBytes).toBe(expected);
  });
});
