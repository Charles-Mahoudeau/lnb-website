import { eq, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import { modpackMod, modpackState, storedFile } from '~~/server/db/schema';
import { modCatalog, CatalogUnavailableError } from '~~/server/services/mods/catalog';
import { modSettingsService } from '~~/server/services/mods/settings';
import { wardenAuditService } from '~~/server/services/warden/audit';
import type { WardenActor } from '~~/server/services/warden/shared';

import { downloadAndHash, DownloadError } from './download';
import { resolveLatest, SourceUnavailableError } from './latest';

import type {
  ModpackAddBody,
  ModpackAttention,
  ModpackFile,
  ModpackList,
  ModpackModView,
  ModpackPatchBody,
  ModpackPinBody,
  ModpackProblem,
  ModpackSide,
  ModpackSource,
  ModpackStatus,
} from '#shared/schemas/modpack';

// The Modlist: the launcher's modpack, apart from the mod vote. Every change that a launcher could
// see bumps the manifest's revision and is written to warden_audit. See docs/modpack.md.

type WebActor = WardenActor & { source: 'web' };
type Row = typeof modpackMod.$inferSelect;
type Pinned = Pick<
  typeof modpackMod.$inferInsert,
  | 'pinnedVersion'
  | 'pinnedFileName'
  | 'pinnedUrl'
  | 'pinnedSha256'
  | 'pinnedSha512'
  | 'pinnedSize'
  | 'pinnedFileId'
>;

function refuse(status: number, problem: ModpackProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/** The address a library file is served from. */
const libraryUrl = (sha256: string, name: string) =>
  `/api/files/${sha256}/${encodeURIComponent(name)}`;

function pinnedOf(row: Row): ModpackFile | null {
  if (!row.pinnedVersion) return null;
  return {
    version: row.pinnedVersion,
    fileName: row.pinnedFileName ?? '',
    url:
      row.pinnedFileId && row.pinnedSha256 && row.pinnedFileName
        ? libraryUrl(row.pinnedSha256, row.pinnedFileName)
        : row.pinnedUrl,
    sha256: row.pinnedSha256,
    sha512: row.pinnedSha512,
    size: row.pinnedSize,
  };
}

function latestOf(row: Row): ModpackFile | null {
  if (!row.latestVersion) return null;
  return {
    version: row.latestVersion,
    fileName: row.latestFileName ?? '',
    url: row.latestUrl,
    sha256: row.latestSha256,
    sha512: row.latestSha512,
    size: row.latestSize,
  };
}

/** A mod waiting for an admin, or with a newer file than the pinned one, or fine. */
export function statusOf(row: Row): ModpackStatus {
  if (row.attention || !row.pinnedSha512) return 'attention';
  if (row.latestSha512 && row.latestSha512 !== row.pinnedSha512) return 'update';
  return 'ok';
}

function toView(row: Row): ModpackModView {
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    pageUrl: row.pageUrl,
    source: row.source as ModpackSource,
    sourceId: row.sourceId,
    side: row.side as ModpackSide,
    optional: row.optional,
    status: statusOf(row),
    attention:
      (row.attention as ModpackAttention | null) ?? (row.pinnedSha512 ? null : 'noCompatibleFile'),
    pinned: pinnedOf(row),
    pinnedFileId: row.pinnedFileId,
    latest: latestOf(row),
    latestCheckedAt: row.latestCheckedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Raises the revision: what a launcher reads from the manifest has changed. */
async function bump(tx: Tx): Promise<void> {
  await tx
    .update(modpackState)
    .set({ revision: sql`${modpackState.revision} + 1`, updatedAt: new Date() })
    .where(eq(modpackState.id, 1));
}

async function list(): Promise<ModpackList> {
  const [state] = await db.select().from(modpackState).where(eq(modpackState.id, 1));
  const rows = await db.select().from(modpackMod).orderBy(modpackMod.name);
  return {
    revision: state?.revision ?? 1,
    changedAt: (state?.updatedAt ?? new Date()).toISOString(),
    // Only mods the manifest lists count: a mod needing attention has no file to download.
    totalBytes: rows.reduce((sum, row) => sum + (row.pinnedSha512 ? (row.pinnedSize ?? 0) : 0), 0),
    items: rows.map(toView),
  };
}

async function viewOf(id: string): Promise<ModpackModView> {
  const [row] = await db.select().from(modpackMod).where(eq(modpackMod.id, id));
  if (!row) refuse(404, 'notFound');
  return toView(row);
}

async function libraryJar(fileId: string) {
  const [file] = await db.select().from(storedFile).where(eq(storedFile.id, fileId));
  if (!file) refuse(404, 'fileNotFound');
  if (file.kind !== 'mod') refuse(409, 'notModFile');
  return file;
}

function pinnedFromLibrary(file: typeof storedFile.$inferSelect, version: string): Pinned {
  return {
    pinnedVersion: version,
    pinnedFileName: file.name,
    pinnedUrl: null,
    pinnedSha256: file.sha256,
    pinnedSha512: file.sha512,
    pinnedSize: file.size,
    pinnedFileId: file.id,
  };
}

/** What a new entry holds, from the add request. */
async function valuesFor(body: ModpackAddBody): Promise<typeof modpackMod.$inferInsert> {
  const base = { side: body.side ?? 'both', optional: body.optional ?? false };
  if (body.source === 'upload') {
    return {
      ...base,
      source: 'upload',
      name: body.name,
      ...pinnedFromLibrary(await libraryJar(body.fileId), body.version),
    };
  }
  if (body.source === 'url') {
    let hashed;
    try {
      hashed = await downloadAndHash(body.url);
    } catch (error) {
      if (error instanceof DownloadError) refuse(400, error.problem);
      throw error;
    }
    return {
      ...base,
      source: 'url',
      name: body.name,
      pageUrl: body.url,
      pinnedVersion: body.version,
      pinnedFileName: hashed.fileName,
      pinnedUrl: body.url,
      pinnedSha256: hashed.sha256,
      pinnedSha512: hashed.sha512,
      pinnedSize: hashed.size,
    };
  }

  // Modrinth or CurseForge: the project, then its newest compatible file.
  const settings = await modSettingsService.get();
  let project;
  let resolution;
  try {
    project = await modCatalog.project(body.source, body.sourceId, settings);
    if (project) resolution = await resolveLatest(body.source, project.sourceId, settings);
  } catch (error) {
    if (error instanceof CatalogUnavailableError || error instanceof SourceUnavailableError) {
      refuse(502, 'sourceUnavailable');
    }
    throw error;
  }
  if (!project || !resolution) refuse(404, 'notFound');
  const values = {
    ...base,
    source: project.source,
    sourceId: project.sourceId,
    name: project.name,
    summary: project.summary,
    pageUrl: project.pageUrl,
  } satisfies Partial<typeof modpackMod.$inferInsert>;
  if (resolution.kind === 'file') {
    const { file } = resolution;
    return {
      ...values,
      pinnedVersion: file.version,
      pinnedFileName: file.fileName,
      pinnedUrl: file.url,
      pinnedSha256: file.sha256,
      pinnedSha512: file.sha512,
      pinnedSize: file.size,
      // Just looked up, so it is the latest too.
      latestVersion: file.version,
      latestFileName: file.fileName,
      latestUrl: file.url,
      latestSha256: file.sha256,
      latestSha512: file.sha512,
      latestSize: file.size,
      latestCheckedAt: new Date(),
    };
  }
  // Added anyway, flagged and out of the manifest: there is something to do about it.
  return {
    ...values,
    attention: resolution.kind === 'blocked' ? 'downloadBlocked' : 'noCompatibleFile',
    pinnedVersion: resolution.kind === 'blocked' ? resolution.version : null,
    pinnedFileName: resolution.kind === 'blocked' ? resolution.fileName : null,
  };
}

async function add(input: { body: ModpackAddBody; actor: WebActor }): Promise<{ id: string }> {
  const values = await valuesFor(input.body);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(modpackMod).values(values).returning({ id: modpackMod.id });
      await bump(tx);
      await wardenAuditService.record(tx, {
        action: 'modpack.add',
        actor: input.actor,
        data: { modId: row!.id, name: values.name, source: values.source },
      });
      return { id: row!.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) refuse(409, 'duplicate');
    throw error;
  }
}

/** Changes the details a launcher or an admin sees. A custom or uploaded mod's version is typed. */
async function edit(input: { id: string; patch: ModpackPatchBody; actor: WebActor }) {
  const { patch } = input;
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(modpackMod).where(eq(modpackMod.id, input.id));
    if (!row) refuse(404, 'notFound');
    const set: Partial<typeof modpackMod.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.side !== undefined) set.side = patch.side;
    if (patch.optional !== undefined) set.optional = patch.optional;
    // Modrinth and CurseForge versions come from the source, so only typed ones can be edited.
    if (patch.version !== undefined && (row.source === 'url' || row.source === 'upload')) {
      set.pinnedVersion = patch.version;
    }
    if (Object.keys(set).length === 0) return;
    await tx.update(modpackMod).set(set).where(eq(modpackMod.id, input.id));
    await bump(tx);
    await wardenAuditService.record(tx, {
      action: 'modpack.edit',
      actor: input.actor,
      data: { modId: row.id, name: row.name, fields: Object.keys(set) },
    });
  });
}

/**
 * Points a mod at a Files library jar. This is how a CurseForge mod whose downloads are blocked
 * gets its file, and how any mod can be switched to a jar the team hosts. It clears the flag.
 */
async function pinFile(input: { id: string; body: ModpackPinBody; actor: WebActor }) {
  const file = await libraryJar(input.body.fileId);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(modpackMod).where(eq(modpackMod.id, input.id));
    if (!row) refuse(404, 'notFound');
    await tx
      .update(modpackMod)
      .set({ ...pinnedFromLibrary(file, input.body.version), attention: null })
      .where(eq(modpackMod.id, input.id));
    await bump(tx);
    await wardenAuditService.record(tx, {
      action: 'modpack.pin',
      actor: input.actor,
      data: { modId: row.id, name: row.name, fileId: file.id, version: input.body.version },
    });
  });
}

async function remove(input: { id: string; actor: WebActor }) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(modpackMod).where(eq(modpackMod.id, input.id)).returning();
    if (!row) refuse(404, 'notFound');
    await bump(tx);
    await wardenAuditService.record(tx, {
      action: 'modpack.remove',
      actor: input.actor,
      data: { modId: row.id, name: row.name },
    });
  });
}

export const modpackService = { list, viewOf, add, edit, pinFile, remove };
