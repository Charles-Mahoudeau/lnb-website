import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { desc, eq, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import { storedFile, user } from '~~/server/db/schema';
import { usageOfFiles } from '~~/server/services/modpack/usage';
import { wardenAuditService } from '~~/server/services/warden/audit';

import { FILE_EXTENSIONS, MAX_FILE_BYTES, ZIP_EXTENSIONS } from '#shared/schemas/files';
import type { FileKind, FileList, FileProblem, FileView } from '#shared/schemas/files';

// The Files library: jars and assets the launcher downloads, uploaded by Warden admins. Files are
// streamed to the VPS's disk (`.data/files/<sha256>`) while they are hashed, so a 100 MB jar never
// sits in memory. Nitro's storage layer reads and writes whole files, which is why it isn't used
// here. See docs/files.md.

const DOWNLOAD_PREFIX = '/api/files/';

function refuse(status: number, problem: FileProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/** Where the files live. `FILES_DIR` is for the tests. */
function filesDir(): string {
  return process.env.FILES_DIR ?? resolve(process.cwd(), '.data/files');
}

/** The name a file is kept and served under: no path, and only letters, digits and `._+-`. */
export function cleanFileName(input: string): { name: string; extension: string } {
  const base = input.split(/[\\/]/).pop() ?? '';
  const name = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._+-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  const dot = name.lastIndexOf('.');
  if (name === '' || dot <= 0 || dot === name.length - 1) refuse(400, 'fileBadName');
  return { name, extension: name.slice(dot + 1).toLowerCase() };
}

/** Whether the first bytes are those of a zip archive, which every jar is. */
function looksLikeZip(head: Buffer): boolean {
  return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && [3, 5, 7].includes(head[2]!);
}

function downloadUrl(sha256: string, name: string): string {
  return `${DOWNLOAD_PREFIX}${sha256}/${encodeURIComponent(name)}`;
}

/** What points at each file, by file ID: the Modlist's mods. A file in use cannot be deleted. */
function usageOf(ids: string[]): Promise<Map<string, string[]>> {
  return usageOfFiles(ids);
}

type Row = typeof storedFile.$inferSelect;

function toView(row: Row, uploadedBy: string | null, usedBy: string[]): FileView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as FileKind,
    size: row.size,
    sha256: row.sha256,
    sha512: row.sha512,
    url: downloadUrl(row.sha256, row.name),
    usedBy,
    uploadedAt: row.createdAt.toISOString(),
    uploadedBy,
  };
}

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] ?? null;

async function list(): Promise<FileList> {
  const rows = await db
    .select({ file: storedFile, uploaderName: user.name })
    .from(storedFile)
    .leftJoin(user, eq(user.id, storedFile.uploadedByUserId))
    .orderBy(desc(storedFile.createdAt));
  const usage = await usageOf(rows.map((row) => row.file.id));
  const [total] = await db
    .select({ bytes: sql<number>`coalesce(sum(${storedFile.size}), 0)::float8` })
    .from(storedFile);
  return {
    items: rows.map((row) =>
      toView(row.file, firstName(row.uploaderName), usage.get(row.file.id) ?? []),
    ),
    totalBytes: total?.bytes ?? 0,
  };
}

async function viewOf(id: string): Promise<FileView> {
  const [row] = await db
    .select({ file: storedFile, uploaderName: user.name })
    .from(storedFile)
    .leftJoin(user, eq(user.id, storedFile.uploadedByUserId))
    .where(eq(storedFile.id, id));
  if (!row) refuse(404, 'fileNotFound');
  const usage = await usageOf([id]);
  return toView(row.file, firstName(row.uploaderName), usage.get(id) ?? []);
}

/** Hashes and counts what passes through, and stops a file that grows past the limit. */
function digest() {
  const sha256 = createHash('sha256');
  const sha512 = createHash('sha512');
  const state = { bytes: 0, head: Buffer.alloc(0) };
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      state.bytes += chunk.length;
      if (state.bytes > MAX_FILE_BYTES) {
        callback(new Error('too large'));
        return;
      }
      if (state.head.length < 4) {
        state.head = Buffer.concat([state.head, chunk]).subarray(0, 4);
      }
      sha256.update(chunk);
      sha512.update(chunk);
      callback(null, chunk);
    },
  });
  return { stream, state, sha256, sha512 };
}

async function removeQuietly(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/**
 * Stores the request body as a file. The name and kind are checked first, and the size while it
 * streams. Jars and zip files must start like a zip archive. The same bytes are stored once.
 */
async function ingest(input: {
  body: Readable;
  name: string;
  kind: FileKind;
  contentLength: number | null;
  actorUserId: string;
}): Promise<FileView> {
  const { name, extension } = cleanFileName(input.name);
  if (!FILE_EXTENSIONS[input.kind].includes(extension)) refuse(400, 'fileBadType');
  if (input.contentLength !== null && input.contentLength > MAX_FILE_BYTES) {
    refuse(413, 'fileTooLarge');
  }

  const dir = filesDir();
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.upload-${crypto.randomUUID()}`);
  const counted = digest();
  try {
    await pipeline(input.body, counted.stream, createWriteStream(temp));
  } catch (error) {
    await removeQuietly(temp);
    if (error instanceof Error && error.message === 'too large') refuse(413, 'fileTooLarge');
    refuse(400, 'fileUnreadable');
  }

  const { bytes, head } = counted.state;
  const sha256 = counted.sha256.digest('hex');
  const sha512 = counted.sha512.digest('hex');
  if (bytes === 0) {
    await removeQuietly(temp);
    refuse(400, 'fileEmpty');
  }
  if (ZIP_EXTENSIONS.includes(extension) && !looksLikeZip(head)) {
    await removeQuietly(temp);
    refuse(400, 'fileBadType');
  }

  const [existing] = await db
    .select({ id: storedFile.id })
    .from(storedFile)
    .where(eq(storedFile.sha256, sha256));
  if (existing) {
    await removeQuietly(temp);
    refuse(409, 'fileDuplicate');
  }

  await rename(temp, join(dir, sha256));
  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(storedFile)
        .values({
          sha256,
          sha512,
          name,
          kind: input.kind,
          size: bytes,
          uploadedByUserId: input.actorUserId,
        })
        .returning({ id: storedFile.id });
      await wardenAuditService.record(tx, {
        action: 'file.upload',
        actor: { source: 'web', userId: input.actorUserId },
        data: { fileId: row!.id, name, kind: input.kind, size: bytes },
      });
      return row!.id;
    });
    return await viewOf(id);
  } catch (error) {
    // Two uploads of the same bytes at once: the other one wins and owns the file.
    if (isUniqueViolation(error)) refuse(409, 'fileDuplicate');
    await removeQuietly(join(dir, sha256));
    throw error;
  }
}

/** Deletes a file and its row, unless something points at it. */
async function remove(input: { id: string; actorUserId: string }): Promise<void> {
  const [row] = await db.select().from(storedFile).where(eq(storedFile.id, input.id));
  if (!row) refuse(404, 'fileNotFound');
  const usedBy = (await usageOf([row.id])).get(row.id) ?? [];
  if (usedBy.length > 0) refuse(409, 'fileInUse');
  await db.transaction(async (tx) => {
    await tx.delete(storedFile).where(eq(storedFile.id, row.id));
    await wardenAuditService.record(tx, {
      action: 'file.delete',
      actor: { source: 'web', userId: input.actorUserId },
      data: { fileId: row.id, name: row.name, kind: row.kind },
    });
  });
  await removeQuietly(join(filesDir(), row.sha256));
}

/**
 * Changes what a file is for. The new kind must accept the file's extension, and a file that
 * something points at keeps its kind, since that use depends on it. In practice only jars move,
 * between mod, wrapper and updater, because no extension is accepted by both a jar kind and asset,
 * so the manifest's assets never change here.
 */
async function setKind(input: {
  id: string;
  kind: FileKind;
  actorUserId: string;
}): Promise<FileView> {
  const [row] = await db.select().from(storedFile).where(eq(storedFile.id, input.id));
  if (!row) refuse(404, 'fileNotFound');
  if (row.kind !== input.kind) {
    const extension = row.name.slice(row.name.lastIndexOf('.') + 1).toLowerCase();
    if (!FILE_EXTENSIONS[input.kind].includes(extension)) refuse(400, 'fileBadType');
    if (((await usageOf([row.id])).get(row.id) ?? []).length > 0) refuse(409, 'fileInUse');
    await db.transaction(async (tx) => {
      await tx.update(storedFile).set({ kind: input.kind }).where(eq(storedFile.id, row.id));
      await wardenAuditService.record(tx, {
        action: 'file.kind',
        actor: { source: 'web', userId: input.actorUserId },
        data: { fileId: row.id, name: row.name, from: row.kind, to: input.kind },
      });
    });
  }
  return viewOf(row.id);
}

/** A stored file ready to be sent, or undefined. The name is the one it was uploaded with. */
async function open(
  sha256: string,
): Promise<{ name: string; size: number; stream: Readable } | undefined> {
  const [row] = await db.select().from(storedFile).where(eq(storedFile.sha256, sha256));
  if (!row) return undefined;
  const path = join(filesDir(), row.sha256);
  try {
    await stat(path);
  } catch {
    return undefined;
  }
  return { name: row.name, size: row.size, stream: createReadStream(path) };
}

export const fileService = { list, ingest, remove, setKind, open };
