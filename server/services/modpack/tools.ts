import { eq } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { modpackTool, storedFile, user } from '~~/server/db/schema';
import { wardenAuditService } from '~~/server/services/warden/audit';
import type { WardenActor } from '~~/server/services/warden/shared';

import { bump } from './revision';

import { MODPACK_TOOL_KINDS } from '#shared/schemas/modpack';
import type {
  ModpackProblem,
  ModpackTool,
  ModpackToolBody,
  ModpackToolList,
  ModpackToolView,
} from '#shared/schemas/modpack';

// The launcher's own tools: the wrapper jar (`launcher`) and the updater jar (`updater`). One file
// of the Files library is current for each, and publishing another one raises the manifest's
// revision. Rolling back is publishing the previous file again. See docs/modpack.md.

type WebActor = WardenActor & { source: 'web' };

function refuse(status: number, problem: ModpackProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

/** The address a library file is served from. */
export const toolLibraryPath = (sha256: string, name: string) =>
  `/api/files/${sha256}/${encodeURIComponent(name)}`;

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] ?? null;

type Joined = {
  tool: typeof modpackTool.$inferSelect;
  file: typeof storedFile.$inferSelect;
  publisher: string | null;
};

function toView({ tool, file, publisher }: Joined): ModpackToolView {
  return {
    tool: tool.tool as ModpackTool,
    version: tool.version,
    notes: tool.notes,
    fileId: file.id,
    fileName: file.name,
    size: file.size,
    sha256: file.sha256,
    sha512: file.sha512,
    url: toolLibraryPath(file.sha256, file.name),
    publishedAt: tool.publishedAt.toISOString(),
    publishedBy: firstName(publisher),
  };
}

async function joined(): Promise<Joined[]> {
  const rows = await db
    .select({ tool: modpackTool, file: storedFile, publisher: user.name })
    .from(modpackTool)
    .innerJoin(storedFile, eq(storedFile.id, modpackTool.fileId))
    .leftJoin(user, eq(user.id, modpackTool.publishedByUserId))
    .orderBy(modpackTool.tool);
  return rows;
}

/** The tools that have a current file, as the admin sees them. */
async function list(): Promise<ModpackToolList> {
  return { items: (await joined()).map(toView) };
}

/** The current file of one tool, or undefined while none is published. */
async function current(tool: ModpackTool): Promise<ModpackToolView | undefined> {
  const found = (await joined()).find((row) => row.tool.tool === tool);
  return found ? toView(found) : undefined;
}

/** The Files library entry must be the kind this tool is made of. */
async function publish(input: { tool: ModpackTool; body: ModpackToolBody; actor: WebActor }) {
  const [file] = await db.select().from(storedFile).where(eq(storedFile.id, input.body.fileId));
  if (!file) refuse(404, 'fileNotFound');
  if (file.kind !== MODPACK_TOOL_KINDS[input.tool]) refuse(409, 'notToolFile');
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(modpackTool).where(eq(modpackTool.tool, input.tool));
    const values = {
      fileId: file.id,
      version: input.body.version,
      notes: input.body.notes,
      publishedAt: new Date(),
      publishedByUserId: input.actor.userId,
    };
    await tx
      .insert(modpackTool)
      .values({ tool: input.tool, ...values })
      .onConflictDoUpdate({ target: modpackTool.tool, set: values });
    await bump(tx);
    await wardenAuditService.record(tx, {
      action: 'modpack.tool',
      actor: input.actor,
      data: {
        tool: input.tool,
        from: before?.version ?? null,
        to: input.body.version,
        fileId: file.id,
      },
    });
  });
}

export const modpackToolService = { list, current, publish };
