import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { modpackState, user, audit as auditLog } from '~~/server/db/schema';
import { fileService } from '~~/server/services/files';
import { modpackToolService } from '~~/server/services/modpack/tools';

// The Modlist's service reaches Modrinth through a cache that needs Nitro, which isn't running.
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: <T>(fn: T) => fn,
  useStorage: () => ({}),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ADMIN = 'modpack-tools-admin';
const actor = { source: 'web', userId: ADMIN } as const;

let dir: string;
let counter = 0;

async function upload(kind: 'wrapper' | 'updater' | 'mod') {
  const bytes = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from(`${String(++counter)}-${Math.random().toString(16)}`),
  ]);
  return fileService.ingest({
    body: Readable.from([bytes]),
    name: `${kind}.jar`,
    kind,
    contentLength: bytes.length,
    actorUserId: ADMIN,
  });
}

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

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lnb-tools-'));
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

describe('modpackToolService', () => {
  it('publishes a jar as current, bumps the revision and audits it', async () => {
    const file = await upload('wrapper');
    const before = await revision();
    await modpackToolService.publish({
      tool: 'launcher',
      body: { fileId: file.id, version: '1.0.0', notes: 'First' },
      actor,
    });
    expect(await modpackToolService.current('launcher')).toMatchObject({
      version: '1.0.0',
      notes: 'First',
      fileId: file.id,
      sha256: file.sha256,
      url: file.url,
      publishedBy: 'Ada',
    });
    expect(await revision()).toBe(before + 1);
    const audit = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'minecraft.modpack.tool'));
    expect(audit.length).toBeGreaterThan(0);
  });

  it('replaces the current file, and a file that is current cannot be deleted', async () => {
    const first = await upload('updater');
    const second = await upload('updater');
    await modpackToolService.publish({
      tool: 'updater',
      body: { fileId: first.id, version: '1', notes: '' },
      actor,
    });
    await modpackToolService.publish({
      tool: 'updater',
      body: { fileId: second.id, version: '2', notes: '' },
      actor,
    });
    expect((await modpackToolService.current('updater'))?.fileId).toBe(second.id);
    expect(await problemOf(fileService.remove({ id: second.id, actorUserId: ADMIN }))).toBe(
      'fileInUse',
    );
    // No longer current, so it can go.
    await fileService.remove({ id: first.id, actorUserId: ADMIN });
  });

  it('refuses a file of the wrong kind, and an unknown file', async () => {
    const mod = await upload('mod');
    const updater = await upload('updater');
    expect(
      await problemOf(
        modpackToolService.publish({
          tool: 'launcher',
          body: { fileId: mod.id, version: '1', notes: '' },
          actor,
        }),
      ),
    ).toBe('notToolFile');
    expect(
      await problemOf(
        modpackToolService.publish({
          tool: 'launcher',
          body: { fileId: updater.id, version: '1', notes: '' },
          actor,
        }),
      ),
    ).toBe('notToolFile');
    expect(
      await problemOf(
        modpackToolService.publish({
          tool: 'launcher',
          body: { fileId: crypto.randomUUID(), version: '1', notes: '' },
          actor,
        }),
      ),
    ).toBe('fileNotFound');
  });
});
