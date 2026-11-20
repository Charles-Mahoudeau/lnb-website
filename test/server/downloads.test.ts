import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { audit as auditLog, downloadFile, downloadSetting, user } from '~~/server/db/schema';
import { downloadService } from '~~/server/services/downloads';
import { fileService } from '~~/server/services/files';

import type { FileKind } from '#shared/schemas/files';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ADMIN = 'downloads-test-admin';

let dir: string;
let counter = 0;
const unique = () =>
  `${String(++counter)}-${String(Date.now())}-${Math.random().toString(16).slice(2)}`;
const zip = (tag: string) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(tag)]);

const upload = (bytes: Buffer, name: string, kind: FileKind) =>
  fileService.ingest({
    body: Readable.from([bytes]),
    name,
    kind,
    contentLength: bytes.length,
    actorUserId: ADMIN,
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
  dir = await mkdtemp(join(tmpdir(), 'lnb-downloads-'));
  process.env.FILES_DIR = dir;
  await db
    .insert(user)
    .values({ id: ADMIN, name: 'Ada Lovelace', email: `${ADMIN}@epitech.eu`, tenantId: EPITECH })
    .onConflictDoNothing();
});
beforeEach(async () => {
  await db.delete(downloadFile);
});
afterAll(async () => {
  await db.delete(downloadFile);
  await db.delete(downloadSetting);
  await db.delete(auditLog).where(eq(auditLog.actorUserId, ADMIN));
  delete process.env.FILES_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('the download slots', () => {
  it('offer nothing until an admin fills them', async () => {
    expect(await downloadService.getPublic()).toEqual({
      instance: null,
      cracked: { windows: null, macos: null, linux: null },
      crackedReleaseUrl: null,
    });
    expect((await downloadService.getAdmin()).slots.map((slot) => slot.slot)).toEqual([
      'instance',
      'cracked-windows',
      'cracked-macos',
      'cracked-linux',
    ]);
  });

  it('show a library file with its link, and the version label', async () => {
    const file = await upload(zip(unique()), 'lnb-instance.zip', 'download');
    await downloadService.set({
      slot: 'instance',
      body: { fileId: file.id, version: ' 1.4.0 ' },
      actorId: ADMIN,
    });
    const view = await downloadService.getPublic();
    expect(view.instance).toEqual({
      name: 'lnb-instance.zip',
      size: file.size,
      version: '1.4.0',
      sha256: file.sha256,
      url: file.url,
    });
    expect(view.cracked.linux).toBeNull();
  });

  it('take another file by replacing the slot, and write an audit row', async () => {
    const first = await upload(zip(unique()), 'prism-1.exe', 'download');
    const second = await upload(zip(unique()), 'prism-2.exe', 'download');
    await downloadService.set({
      slot: 'cracked-windows',
      body: { fileId: first.id },
      actorId: ADMIN,
    });
    await downloadService.set({
      slot: 'cracked-windows',
      body: { fileId: second.id },
      actorId: ADMIN,
    });
    expect((await downloadService.getPublic()).cracked.windows?.name).toBe('prism-2.exe');
    const audit = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'minecraft.downloads.update'));
    expect(audit.filter((row) => row.actorUserId === ADMIN).length).toBeGreaterThanOrEqual(2);
  });

  it('refuse a file that is not of the download kind, or that does not exist', async () => {
    const asset = await upload(zip(unique()), 'pack.zip', 'asset');
    expect(
      await problemOf(
        downloadService.set({ slot: 'instance', body: { fileId: asset.id }, actorId: ADMIN }),
      ),
    ).toBe('notDownloadFile');
    expect(
      await problemOf(
        downloadService.set({
          slot: 'instance',
          body: { fileId: '00000000-0000-4000-8000-000000000000' },
          actorId: ADMIN,
        }),
      ),
    ).toBe('fileNotFound');
  });

  it('keep a file in use out of deletion, until the slot is emptied', async () => {
    const file = await upload(zip(unique()), 'prism.dmg', 'download');
    await downloadService.set({ slot: 'cracked-macos', body: { fileId: file.id }, actorId: ADMIN });
    expect(await problemOf(fileService.remove({ id: file.id, actorUserId: ADMIN }))).toBe(
      'fileInUse',
    );
    await downloadService.clear({ slot: 'cracked-macos', actorId: ADMIN });
    expect((await downloadService.getPublic()).cracked.macos).toBeNull();
    await fileService.remove({ id: file.id, actorUserId: ADMIN });
  });

  it('keep a link to PrismCracked’s releases, which an empty value removes', async () => {
    const url = 'https://github.com/Diegiwg/PrismLauncher-Cracked/releases/tag/11.1.1';
    await downloadService.updateSettings({
      body: { crackedReleaseUrl: ` ${url} ` },
      actorId: ADMIN,
    });
    expect((await downloadService.getPublic()).crackedReleaseUrl).toBe(url);
    expect((await downloadService.getAdmin()).crackedReleaseUrl).toBe(url);
    await downloadService.updateSettings({ body: { crackedReleaseUrl: '' }, actorId: ADMIN });
    expect((await downloadService.getPublic()).crackedReleaseUrl).toBeNull();
  });

  it('accept installers in the library only as downloads', async () => {
    expect(await problemOf(upload(Buffer.from(unique()), 'prism.exe', 'asset'))).toBe(
      'fileBadType',
    );
    const file = await upload(Buffer.from(unique()), 'prism.exe', 'download');
    expect(file.kind).toBe('download');
  });
});
