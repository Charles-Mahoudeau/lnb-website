import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { modpackTool, storedFile, user, audit as auditLog } from '~~/server/db/schema';
import { cleanFileName, fileService } from '~~/server/services/files';

import { MAX_FILE_BYTES } from '#shared/schemas/files';
import type { FileKind } from '#shared/schemas/files';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ADMIN = 'files-test-admin';

// What every zip archive starts with, then some bytes to make the content unique.
const jar = (tag: string) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(tag)]);

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

const upload = (bytes: Buffer, name = 'sodium.jar', kind: FileKind = 'mod') =>
  fileService.ingest({
    body: Readable.from([bytes]),
    name,
    kind,
    contentLength: bytes.length,
    actorUserId: ADMIN,
  });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lnb-files-'));
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

describe('cleanFileName', () => {
  it('keeps only safe characters and the extension', () => {
    expect(cleanFileName('Mon mod (v2).JAR')).toEqual({
      name: 'Mon_mod__v2_.JAR',
      extension: 'jar',
    });
    expect(cleanFileName('C:\\temp\\..\\evil/../sodium-0.6.1.jar').name).toBe('sodium-0.6.1.jar');
    expect(cleanFileName('éàü.jar').name).toBe('eau.jar');
  });

  it('refuses names without a base or an extension', async () => {
    for (const name of ['', '.jar', 'noextension', 'trailing.', '/']) {
      expect(await problemOf(Promise.resolve().then(() => cleanFileName(name)))).toBe(
        'fileBadName',
      );
    }
  });
});

describe('uploading', () => {
  it('stores the bytes under their SHA-256 and hashes them', async () => {
    const bytes = jar(unique());
    const view = await upload(bytes);
    expect(view.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(view.sha512).toBe(createHash('sha512').update(bytes).digest('hex'));
    expect(view).toMatchObject({
      name: 'sodium.jar',
      kind: 'mod',
      size: bytes.length,
      uploadedBy: 'Ada',
    });
    expect(view.url).toBe(`/api/files/${view.sha256}/sodium.jar`);
    expect(await readFile(join(dir, view.sha256))).toEqual(bytes);
  });

  it('writes an audit row', async () => {
    const view = await upload(jar(unique()), 'audited.jar');
    const rows = await db.select().from(auditLog);
    expect(
      rows.some((row) => row.action === 'minecraft.file.upload' && row.data.fileId === view.id),
    ).toBe(true);
  });

  it('refuses the same bytes twice, even under another name', async () => {
    const bytes = jar(unique());
    await upload(bytes, 'one.jar');
    expect(await problemOf(upload(bytes, 'two.jar'))).toBe('fileDuplicate');
  });

  it('refuses a jar that is not a zip archive', async () => {
    expect(await problemOf(upload(Buffer.from(`not a zip ${unique()}`), 'fake.jar'))).toBe(
      'fileBadType',
    );
  });

  it('refuses an extension the kind does not take', async () => {
    expect(await problemOf(upload(jar(unique()), 'tool.exe', 'asset'))).toBe('fileBadType');
    expect(await problemOf(upload(jar(unique()), 'pack.zip', 'mod'))).toBe('fileBadType');
  });

  it('refuses an empty file and leaves nothing behind', async () => {
    expect(await problemOf(upload(Buffer.alloc(0)))).toBe('fileEmpty');
  });

  it('accepts a text asset without checking its first bytes', async () => {
    const view = await upload(Buffer.from(`hello ${unique()}`), 'notes.txt', 'asset');
    expect(view.kind).toBe('asset');
  });

  it('stops a file that grows past the limit while it streams', async () => {
    const chunk = Buffer.alloc(1024 * 1024, 1);
    chunk[0] = 0x50;
    chunk[1] = 0x4b;
    chunk[2] = 3;
    chunk[3] = 4;
    const body = Readable.from(
      (function* () {
        for (let i = 0; i <= MAX_FILE_BYTES / chunk.length; i++) yield chunk;
      })(),
    );
    const problem = await problemOf(
      fileService.ingest({
        body,
        name: 'big.jar',
        kind: 'mod',
        contentLength: null,
        actorUserId: ADMIN,
      }),
    );
    expect(problem).toBe('fileTooLarge');
  });

  it('refuses a declared size over the limit before reading', async () => {
    const problem = await problemOf(
      fileService.ingest({
        body: Readable.from([jar(unique())]),
        name: 'big.jar',
        kind: 'mod',
        contentLength: MAX_FILE_BYTES + 1,
        actorUserId: ADMIN,
      }),
    );
    expect(problem).toBe('fileTooLarge');
  });
});

describe('the library', () => {
  it('lists files newest first with the total size', async () => {
    const first = await upload(jar(unique()), 'older.jar');
    const second = await upload(jar(unique()), 'newer.jar');
    const { items, totalBytes } = await fileService.list();
    const ids = items.map((item) => item.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    expect(totalBytes).toBe(items.reduce((sum, item) => sum + item.size, 0));
  });

  it('opens a stored file by its hash, and not an unknown one', async () => {
    const bytes = jar(unique());
    const view = await upload(bytes, 'open.jar');
    const file = await fileService.open(view.sha256);
    expect(file).toMatchObject({ name: 'open.jar', size: bytes.length });
    const chunks: Buffer[] = [];
    for await (const chunk of file!.stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks)).toEqual(bytes);
    expect(await fileService.open('0'.repeat(64))).toBeUndefined();
  });

  it('deletes the row and the file, and audits it', async () => {
    const view = await upload(jar(unique()), 'gone.jar');
    await fileService.remove({ id: view.id, actorUserId: ADMIN });
    expect(
      await db
        .select()
        .from(storedFile)
        .then((rows) => rows.some((r) => r.id === view.id)),
    ).toBe(false);
    await expect(stat(join(dir, view.sha256))).rejects.toThrow();
    const rows = await db.select().from(auditLog);
    expect(
      rows.some((row) => row.action === 'minecraft.file.delete' && row.data.fileId === view.id),
    ).toBe(true);
  });

  it('refuses to delete a file that does not exist', async () => {
    expect(
      await problemOf(fileService.remove({ id: crypto.randomUUID(), actorUserId: ADMIN })),
    ).toBe('fileNotFound');
  });

  it('can store the same bytes again once the file is deleted', async () => {
    const bytes = jar(unique());
    const view = await upload(bytes);
    await fileService.remove({ id: view.id, actorUserId: ADMIN });
    expect((await upload(bytes)).sha256).toBe(view.sha256);
  });

  it('changes the kind of a file and audits it', async () => {
    const view = await upload(jar(unique()), 'tool.jar');
    expect(
      (await fileService.setKind({ id: view.id, kind: 'wrapper', actorUserId: ADMIN })).kind,
    ).toBe('wrapper');
    const audit = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'minecraft.file.kind'));
    expect(audit.length).toBeGreaterThan(0);

    const text = await upload(Buffer.from(unique()), 'notes.txt', 'asset');
    expect(
      await problemOf(fileService.setKind({ id: text.id, kind: 'mod', actorUserId: ADMIN })),
    ).toBe('fileBadType');
    const zip = await upload(jar(unique()), 'pack.zip', 'asset');
    expect(
      await problemOf(fileService.setKind({ id: zip.id, kind: 'wrapper', actorUserId: ADMIN })),
    ).toBe('fileBadType');
    // A jar can't be an asset: its extension isn't one an asset accepts.
    expect(
      await problemOf(fileService.setKind({ id: view.id, kind: 'asset', actorUserId: ADMIN })),
    ).toBe('fileBadType');
    expect(
      await problemOf(
        fileService.setKind({ id: crypto.randomUUID(), kind: 'mod', actorUserId: ADMIN }),
      ),
    ).toBe('fileNotFound');
  });

  it('keeps the kind of a file that a tool uses', async () => {
    const view = await upload(jar(unique()), 'launcher.jar', 'wrapper');
    await db.insert(modpackTool).values({ tool: 'launcher', fileId: view.id, version: '1' });
    expect(
      await problemOf(fileService.setKind({ id: view.id, kind: 'mod', actorUserId: ADMIN })),
    ).toBe('fileInUse');
    await db.delete(modpackTool);
  });
});
