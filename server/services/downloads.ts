import { eq } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { downloadFile, downloadSetting, storedFile } from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';
import { fileDownloadUrl } from '~~/server/services/files';

import { DOWNLOAD_SLOTS } from '#shared/schemas/downloads';
import type {
  DownloadFileView,
  DownloadProblem,
  DownloadSlot,
  DownloadSettingsBody,
  DownloadSlotBody,
  DownloadsAdminView,
  DownloadsPublicView,
} from '#shared/schemas/downloads';
import { FILE_EXTENSIONS } from '#shared/schemas/files';

// The files the Minecraft download page offers, picked from the Files library. See
// docs/downloads.md.

function refuse(status: number, problem: DownloadProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

type Joined = {
  slot: string;
  version: string | null;
  updatedAt: Date;
  file: typeof storedFile.$inferSelect;
};

async function rows(): Promise<Map<string, Joined>> {
  const found = await db
    .select({
      slot: downloadFile.slot,
      version: downloadFile.version,
      updatedAt: downloadFile.updatedAt,
      file: storedFile,
    })
    .from(downloadFile)
    .innerJoin(storedFile, eq(storedFile.id, downloadFile.fileId));
  return new Map(found.map((row) => [row.slot, row]));
}

function view(row: Joined | undefined): DownloadFileView | null {
  if (!row) return null;
  return {
    name: row.file.name,
    size: row.file.size,
    version: row.version,
    sha256: row.file.sha256,
    url: fileDownloadUrl(row.file.sha256, row.file.name),
  };
}

async function releaseUrl(): Promise<string | null> {
  const [setting] = await db.select().from(downloadSetting);
  return setting?.crackedReleaseUrl ?? null;
}

async function getPublic(): Promise<DownloadsPublicView> {
  const found = await rows();
  return {
    crackedReleaseUrl: await releaseUrl(),
    instance: view(found.get('instance')),
    cracked: {
      windows: view(found.get('cracked-windows')),
      macos: view(found.get('cracked-macos')),
      linux: view(found.get('cracked-linux')),
    },
  };
}

async function getAdmin(): Promise<DownloadsAdminView> {
  const found = await rows();
  return {
    crackedReleaseUrl: await releaseUrl(),
    slots: DOWNLOAD_SLOTS.map((slot) => {
      const row = found.get(slot);
      const base = view(row);
      return {
        slot,
        file: row && base ? { ...base, id: row.file.id } : null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    }),
  };
}

/** Puts a library file of kind `download` in a slot, replacing what was there. */
async function set(input: {
  slot: DownloadSlot;
  body: DownloadSlotBody;
  actorId: string;
}): Promise<DownloadsAdminView> {
  const [file] = await db.select().from(storedFile).where(eq(storedFile.id, input.body.fileId));
  if (!file) refuse(404, 'fileNotFound');
  if (file.kind !== 'download') refuse(400, 'notDownloadFile');
  const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
  if (!FILE_EXTENSIONS.download.includes(extension)) refuse(400, 'notDownloadFile');
  const version = input.body.version?.trim() || null;
  await db.transaction(async (tx) => {
    const values = { slot: input.slot, fileId: file.id, version, updatedByUserId: input.actorId };
    await tx
      .insert(downloadFile)
      .values(values)
      .onConflictDoUpdate({
        target: downloadFile.slot,
        set: { ...values, updatedAt: new Date() },
      });
    await auditService.record(tx, {
      action: 'minecraft.downloads.update',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: null,
      data: { slot: input.slot, fileId: file.id, name: file.name, version },
    });
  });
  return getAdmin();
}

/** Empties a slot. The file stays in the library. */
async function clear(input: { slot: DownloadSlot; actorId: string }): Promise<DownloadsAdminView> {
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(downloadFile)
      .where(eq(downloadFile.slot, input.slot))
      .returning({ fileId: downloadFile.fileId });
    if (removed.length === 0) return;
    await auditService.record(tx, {
      action: 'minecraft.downloads.update',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: null,
      data: { slot: input.slot, fileId: null, name: null, version: null },
    });
  });
  return getAdmin();
}

/** Saves the settings of the page: the link to PrismCracked's releases. */
async function updateSettings(input: {
  body: DownloadSettingsBody;
  actorId: string;
}): Promise<DownloadsAdminView> {
  const url = input.body.crackedReleaseUrl?.trim() || null;
  await db.transaction(async (tx) => {
    const values = { id: 1, crackedReleaseUrl: url };
    await tx
      .insert(downloadSetting)
      .values(values)
      .onConflictDoUpdate({ target: downloadSetting.id, set: values });
    await auditService.record(tx, {
      action: 'minecraft.downloads.update',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: null,
      data: { setting: 'crackedReleaseUrl', url },
    });
  });
  return getAdmin();
}

export const downloadService = { getPublic, getAdmin, set, clear, updateSettings };
