import { and, eq, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { anticheatFile, anticheatHistory, anticheatProject } from '~~/server/db/schema';
import type { AnticheatPlatformVersion } from '~~/server/db/schema';
import { flagService } from '~~/server/services/flags';

import { platformClient } from './platforms';
import type { CurseforgeMatches, ModrinthMatches, PlatformClient } from './platforms';
import { anticheatReportService } from './reports';
import { anticheatScoringService } from './scoring';
import { anticheatSettingsService } from './settings';
import type { Tx } from './shared';

// Looks the unknown files up on Modrinth and CurseForge, links them to projects and scores them.
// Files wait as `pending` in the database, so any process can pick them up. See docs/anticheat.md.

const HOUR_MS = 60 * 60 * 1000;
/** A claimed file is not claimed again for this long, unless its lookup ended. */
const CLAIM_SECONDS = 30;

type FileRow = typeof anticheatFile.$inferSelect;
export type ClaimedFile = Pick<FileRow, 'sha512' | 'kind' | 'fingerprint' | 'declared'>;

export interface LookupCounts {
  claimed: number;
  found: number;
  notFound: number;
  unavailable: number;
  expired: number;
  /** Verdicts the Minecraft server was told about. */
  reevaluated: number;
}

const NONE: LookupCounts = {
  claimed: 0,
  found: 0,
  notFound: 0,
  unavailable: 0,
  expired: 0,
  reevaluated: 0,
};

/**
 * Takes up to `limit` files that need a lookup, in one statement: the update is the lock, so two
 * runs never get the same file. Pending and timed out files are always due; a file not found is
 * due again after its retry time, while players still use it.
 */
async function claim(limit = 200): Promise<ClaimedFile[]> {
  const { rows } = await db.execute<{
    sha512: string;
    kind: ClaimedFile['kind'];
    fingerprint: string | null;
    declared: ClaimedFile['declared'];
  }>(sql`
    update ${anticheatFile} set lookup_started_at = now()
    where sha512 in (
      select sha512 from ${anticheatFile}
      where (
        lookup_state in ('pending', 'timedOut')
        or (lookup_state = 'notFound' and lookup_retry_at < now() and last_seen_at > now() - interval '7 days')
      )
      and (lookup_started_at is null or lookup_started_at < now() - make_interval(secs => ${CLAIM_SECONDS}))
      order by first_seen_at
      limit ${limit}
      for update skip locked
    )
    returning sha512, kind, fingerprint, declared`);
  return rows.map((row) => ({
    ...row,
    fingerprint: row.fingerprint === null ? null : Number(row.fingerprint),
  }));
}

/** What the platforms said about one file. */
interface Finding {
  modrinth?: { version: NonNullable<AnticheatPlatformVersion['modrinth']> & { projectId: string } };
  curseforge?: { file: NonNullable<AnticheatPlatformVersion['curseforge']> & { modId: number } };
}

type Outcome = 'found' | 'notFound' | 'unavailable' | 'failed';

/**
 * Asks both platforms about the files. A platform that fails leaves the files it could have
 * answered for pending, unless the other platform found them.
 */
async function resolve(
  files: ClaimedFile[],
  client: PlatformClient = platformClient,
): Promise<{ outcomes: Map<string, Outcome>; touched: string[] }> {
  const outcomes = new Map<string, Outcome>();
  if (files.length === 0) return { outcomes, touched: [] };
  const withFingerprint = files.filter((file) => file.fingerprint !== null);
  const [modrinth, curseforge] = await Promise.allSettled([
    client.modrinthByHashes(files.map((file) => file.sha512)),
    client.curseforgeConfigured && withFingerprint.length > 0
      ? client.curseforgeByFingerprints(withFingerprint.map((file) => file.fingerprint!))
      : Promise.resolve(undefined),
  ]);
  const modrinthMatches = modrinth.status === 'fulfilled' ? modrinth.value : undefined;
  const curseforgeMatches = curseforge.status === 'fulfilled' ? curseforge.value : undefined;
  if (modrinth.status === 'rejected' || curseforge.status === 'rejected') {
    console.error('Anticheat: a platform lookup failed');
  }

  const touched: string[] = [];
  for (const file of files) {
    const finding = findingOf(file, modrinthMatches, curseforgeMatches);
    const found = Boolean(finding.modrinth ?? finding.curseforge);
    // Not found is only a fact when every platform that could answer did.
    const complete =
      modrinth.status === 'fulfilled' &&
      (curseforge.status === 'fulfilled' ||
        file.fingerprint === null ||
        !client.curseforgeConfigured);
    if (!found && !complete) {
      await release(file.sha512);
      outcomes.set(file.sha512, 'unavailable');
      continue;
    }
    try {
      const shas = await db.transaction((tx) =>
        found
          ? storeFound(tx, file, finding, modrinthMatches, curseforgeMatches)
          : storeNotFound(tx, file),
      );
      touched.push(...shas);
      outcomes.set(file.sha512, found ? 'found' : 'notFound');
    } catch (error) {
      // The next sweep takes it again once the claim runs out.
      console.error('Anticheat: storing a lookup failed', error);
      outcomes.set(file.sha512, 'failed');
    }
  }
  return { outcomes, touched };
}

function findingOf(
  file: ClaimedFile,
  modrinth: ModrinthMatches | undefined,
  curseforge: CurseforgeMatches | undefined,
): Finding {
  const finding: Finding = {};
  const version = modrinth?.versions.get(file.sha512);
  if (version) finding.modrinth = { version };
  const cfFile = file.fingerprint === null ? undefined : curseforge?.files.get(file.fingerprint);
  if (cfFile) finding.curseforge = { file: cfFile };
  return finding;
}

/** Lets the next sweep take the file at once. */
async function release(sha512: string) {
  await db
    .update(anticheatFile)
    .set({ lookupStartedAt: null })
    .where(eq(anticheatFile.sha512, sha512));
}

/** Merges `other` into `keep`: files, the platform ID and metadata, and the stricter decision. */
async function merge(
  tx: Tx,
  keep: typeof anticheatProject.$inferSelect,
  other: typeof anticheatProject.$inferSelect,
) {
  await tx
    .update(anticheatFile)
    .set({ projectId: keep.id })
    .where(eq(anticheatFile.projectId, other.id));
  await tx.delete(anticheatProject).where(eq(anticheatProject.id, other.id));
  const banned = keep.decision === 'banned' || other.decision === 'banned';
  const decided = banned ? 'banned' : (keep.decision ?? other.decision);
  const source = keep.decision === decided ? keep : other;
  await tx
    .update(anticheatProject)
    .set({
      modrinthId: keep.modrinthId ?? other.modrinthId,
      curseforgeId: keep.curseforgeId ?? other.curseforgeId,
      modrinth: keep.modrinth ?? other.modrinth,
      curseforge: keep.curseforge ?? other.curseforge,
      modIds: [...new Set([...keep.modIds, ...other.modIds])],
      decision: decided,
      decidedAt: decided ? source.decidedAt : null,
      decidedByUserId: decided ? source.decidedByUserId : null,
      decisionNote: decided ? source.decisionNote : null,
    })
    .where(eq(anticheatProject.id, keep.id));
  await tx.insert(anticheatHistory).values({
    projectId: keep.id,
    kind: 'link',
    data: { merged: other.id, modrinthId: other.modrinthId, curseforgeId: other.curseforgeId },
  });
}

async function storeFound(
  tx: Tx,
  file: ClaimedFile,
  finding: Finding,
  modrinth: ModrinthMatches | undefined,
  curseforge: CurseforgeMatches | undefined,
): Promise<string[]> {
  // The file row first: every writer of a file locks it before its project.
  await tx.select().from(anticheatFile).where(eq(anticheatFile.sha512, file.sha512)).for('update');

  const mVersion = finding.modrinth?.version;
  const cFile = finding.curseforge?.file;
  const mProject = mVersion ? modrinth?.projects.get(mVersion.projectId) : undefined;
  const cProject = cFile ? curseforge?.projects.get(cFile.modId) : undefined;
  const modrinthId = mVersion?.projectId;
  const curseforgeId = cFile ? String(cFile.modId) : undefined;

  const find = async (column: 'modrinthId' | 'curseforgeId', id: string | undefined) => {
    if (!id) return undefined;
    const [row] = await tx
      .select()
      .from(anticheatProject)
      .where(eq(anticheatProject[column], id))
      .for('update');
    return row;
  };
  let project = await find('modrinthId', modrinthId);
  const second = await find('curseforgeId', curseforgeId);
  const touched = new Set<string>();
  if (project && second && project.id !== second.id) {
    await merge(tx, project, second);
    [project] = await tx.select().from(anticheatProject).where(eq(anticheatProject.id, project.id));
    // Files of the merged project may score differently now.
    for (const row of await tx
      .select({ sha512: anticheatFile.sha512 })
      .from(anticheatFile)
      .where(eq(anticheatFile.projectId, project!.id))) {
      touched.add(row.sha512);
    }
  }
  project ??= second;

  const declaredId = file.declared.modId?.toLowerCase();
  const platform = {
    ...(mProject ? { modrinth: mProject } : {}),
    ...(cProject ? { curseforge: cProject } : {}),
  };
  if (!project) {
    const name =
      mProject?.title ?? cProject?.name ?? file.declared.name ?? file.sha512.slice(0, 12);
    await tx
      .insert(anticheatProject)
      .values({
        kind: file.kind === 'client' ? 'mod' : file.kind,
        name,
        modrinthId: modrinthId ?? null,
        curseforgeId: curseforgeId ?? null,
        modIds: declaredId ? [declaredId] : [],
        ...platform,
      })
      .onConflictDoNothing();
    project = await find('modrinthId', modrinthId);
    project ??= await find('curseforgeId', curseforgeId);
  }
  if (!project) throw new Error('Anticheat: the project could not be created');

  await tx
    .update(anticheatProject)
    .set({
      // A project found by one ID gains the other when the same file is on both.
      modrinthId: project.modrinthId ?? modrinthId ?? null,
      curseforgeId: project.curseforgeId ?? curseforgeId ?? null,
      ...platform,
      modIds: declaredId
        ? sql`array(select distinct unnest(${anticheatProject.modIds} || ${sql.param([declaredId])}::text[]))`
        : undefined,
    })
    .where(eq(anticheatProject.id, project.id));

  const now = new Date();
  await tx
    .update(anticheatFile)
    .set({
      projectId: project.id,
      platformVersion: {
        ...(mVersion
          ? {
              modrinth: {
                versionId: mVersion.versionId,
                versionNumber: mVersion.versionNumber,
                loaders: mVersion.loaders,
                publishedAt: mVersion.publishedAt,
              },
            }
          : {}),
        ...(cFile ? { curseforge: { fileId: cFile.fileId, publishedAt: cFile.publishedAt } } : {}),
      },
      lookupState: 'found',
      lookedUpAt: now,
      lookupStartedAt: null,
      lookupRetryAt: null,
    })
    .where(eq(anticheatFile.sha512, file.sha512));
  touched.add(file.sha512);
  await anticheatScoringService.scoreFiles(tx, [...touched]);
  return [...touched];
}

async function storeNotFound(tx: Tx, file: ClaimedFile): Promise<string[]> {
  const { rules } = await anticheatSettingsService.get();
  await tx.select().from(anticheatFile).where(eq(anticheatFile.sha512, file.sha512)).for('update');
  const now = new Date();
  let projectId: string | null = null;
  const declaredId = file.declared.modId?.toLowerCase();
  if (declaredId) {
    await tx
      .insert(anticheatProject)
      .values({
        kind: file.kind === 'client' ? 'mod' : file.kind,
        name: file.declared.name ?? declaredId,
        declaredModId: declaredId,
      })
      .onConflictDoNothing();
    const [row] = await tx
      .select({ id: anticheatProject.id })
      .from(anticheatProject)
      .where(eq(anticheatProject.declaredModId, declaredId));
    projectId = row?.id ?? null;
  }
  await tx
    .update(anticheatFile)
    .set({
      lookupState: 'notFound',
      lookedUpAt: now,
      lookupStartedAt: null,
      lookupRetryAt: new Date(now.getTime() + rules.lookup.notFoundRetryHours * HOUR_MS),
      ...(projectId ? { projectId } : {}),
    })
    .where(eq(anticheatFile.sha512, file.sha512));
  await anticheatScoringService.scoreFiles(tx, [file.sha512]);
  return [file.sha512];
}

/**
 * Turns the files that waited longer than the timeout into `timedOut` and scores them as unknown.
 * They stay claimable, so a later lookup can still find them.
 */
async function expire(): Promise<string[]> {
  const { rules } = await anticheatSettingsService.get();
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(anticheatFile)
      .set({ lookupState: 'timedOut' })
      .where(
        and(
          eq(anticheatFile.lookupState, 'pending'),
          sql`coalesce(${anticheatFile.lookupStartedAt}, ${anticheatFile.firstSeenAt}) < now() - make_interval(secs => ${rules.lookup.pendingTimeoutSeconds})`,
        ),
      )
      .returning({ sha512: anticheatFile.sha512 });
    const shas = expired.map((row) => row.sha512);
    await anticheatScoringService.scoreFiles(tx, shas);
    return shas;
  });
}

/** One sweep: claim, look up, expire, and tell the server about the verdicts that changed. */
async function run(client: PlatformClient = platformClient): Promise<LookupCounts> {
  if (!(await flagService.isEnabled('anticheat.lookups'))) {
    // Files stay pending, then time out.
    const expired = await expire();
    return {
      ...NONE,
      expired: expired.length,
      reevaluated: await anticheatReportService.reevaluateFor(expired),
    };
  }
  const claimed = await claim();
  const { outcomes, touched } = await resolve(claimed, client);
  const expired = await expire();
  const count = (outcome: Outcome) => [...outcomes.values()].filter((o) => o === outcome).length;
  return {
    claimed: claimed.length,
    found: count('found'),
    notFound: count('notFound'),
    unavailable: count('unavailable'),
    expired: expired.length,
    reevaluated: await anticheatReportService.reevaluateFor([...new Set([...touched, ...expired])]),
  };
}

const state = { running: false, again: false };

/** Whether a kick came in during the run. Read through a function so the check isn't narrowed. */
function takeAgain(): boolean {
  return state.again;
}

/** Starts a sweep in the background after a report. A sweep already running runs once more. */
function kick(): void {
  if (state.running) {
    state.again = true;
    return;
  }
  state.running = true;
  void (async () => {
    try {
      let more = true;
      while (more) {
        state.again = false;
        await run();
        more = takeAgain();
      }
    } catch (error) {
      console.error('Anticheat: lookup run failed', error);
    } finally {
      state.running = false;
    }
  })();
}

export const anticheatLookupService = { claim, resolve, expire, run, kick };
