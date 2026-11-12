import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  anticheatFile,
  anticheatHistory,
  anticheatProject,
  anticheatUsage,
  minecraftAccount,
  user,
} from '~~/server/db/schema';

import { decodeOffset, encodeOffset, likeEscape, PAGE_SIZE, refuse } from './shared';
import type { Db } from './shared';

import type {
  AnticheatFileDetail,
  AnticheatFilePlayerRow,
  AnticheatFileRow,
  AnticheatFilesQuery,
  AnticheatHistoryEntry,
  AnticheatProjectDetail,
} from '#shared/schemas/anticheat';
import { fileStatus } from '#shared/utils/anticheat';

// What the admin reads about files and projects. The writes are in admin.ts.
// See docs/anticheat.md.

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

const HISTORY_LIMIT = 50;

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

interface RawRow extends Record<string, unknown> {
  project_id: string | null;
  sha512: string | null;
  kind: AnticheatFileRow['kind'];
  name: string;
  file_count: number;
  platforms: ('modrinth' | 'curseforge')[];
  status: AnticheatFileRow['status'];
  score: number | null;
  decision: AnticheatFileRow['decision'];
  using_now: number;
  ever_used: number;
  waiting: number;
  first_seen_ms: number;
  last_scored_ms: number | null;
}

/**
 * The registry: one row per project (its file count, the lowest score of its files) and one row
 * per file without a project. Dates leave the query as epoch milliseconds, since a raw query
 * returns `timestamp` columns as text.
 */
async function files(query: AnticheatFilesQuery): Promise<Page<AnticheatFileRow>> {
  const offset = decodeOffset(query.cursor);
  const like = query.q ? `%${likeEscape(query.q)}%` : null;
  const prefix = query.q ? `${likeEscape(query.q.toLowerCase())}%` : null;
  const where: SQL[] = [];
  if (query.kind) where.push(sql`t.kind = ${query.kind}`);
  if (query.status) where.push(sql`t.status = ${query.status}`);
  if (like && prefix) {
    where.push(sql`t.gkey in (
      select gkey from base
      where sha512 like ${prefix} or filename ilike ${like}
        or declared->>'modId' ilike ${like} or project_name ilike ${like})`);
  }
  if (query.userId) {
    where.push(sql`t.gkey in (
      select b.gkey from base b join ${anticheatUsage} u on u.sha512 = b.sha512
      where u.user_id = ${query.userId})`);
  }
  const order =
    query.sort === 'queue'
      ? sql`t.waiting desc, t.score asc nulls last, t.name asc, t.gkey asc`
      : sql`t.first_seen_at desc, t.gkey asc`;

  const { rows } = await db.execute<RawRow>(sql`
    with base as (
      select f.sha512, f.kind, f.filename, f.declared, f.score, f.band, f.reviewed_band,
        f.first_seen_at, f.scored_at, f.project_id, p.name as project_name,
        p.modrinth_id, p.curseforge_id,
        case when f.project_id is not null then p.decision else f.decision end as decision,
        coalesce(f.project_id::text, f.sha512) as gkey
      from ${anticheatFile} f
      left join ${anticheatProject} p on p.id = f.project_id
      where f.kind <> 'client'
      union all
      -- A project an admin decided on before any player used it has no file yet.
      select null, p.kind, null, null, null, null, null,
        p.created_at, null, p.id, p.name, p.modrinth_id, p.curseforge_id, p.decision, p.id::text
      from ${anticheatProject} p
      where not exists (select 1 from ${anticheatFile} f where f.project_id = p.id)
    ),
    live as (
      select distinct rf.sha512, r.session_id
      from anticheat_report r
      join warden_session s on s.id = r.session_id and s.ended_at is null
      join anticheat_report_file rf on rf.report_id = r.id
      where r.seq = (select max(seq) from anticheat_report where session_id = r.session_id)
    ),
    grp as (
      select gkey, count(sha512)::int as file_count, min(first_seen_at) as first_seen_at,
        max(scored_at) as last_scored_at
      from base group by gkey
    ),
    ever as (
      select b.gkey, count(distinct u.user_id)::int as n
      from base b join ${anticheatUsage} u on u.sha512 = b.sha512 group by b.gkey
    ),
    now as (
      select b.gkey, count(distinct l.session_id)::int as using_now,
        (count(distinct l.session_id) filter (where b.band is null))::int as waiting
      from base b join live l on l.sha512 = b.sha512 group by b.gkey
    ),
    rep as (
      select distinct on (gkey) * from base order by gkey, score asc nulls last, sha512
    ),
    t as (
      select rep.gkey, rep.project_id, rep.sha512, rep.kind, rep.score, rep.decision,
        case when rep.project_id is not null then rep.project_name
          else coalesce(rep.declared->>'name', rep.filename) end as name,
        array_remove(array[
          case when rep.modrinth_id is not null then 'modrinth' end,
          case when rep.curseforge_id is not null then 'curseforge' end], null) as platforms,
        case
          when rep.sha512 is null then rep.decision
          when rep.band is null then 'pending'
          when rep.band = 'banned' then 'banned'
          when rep.band = 'approved' then 'approved'
          when rep.kind = 'shader' then 'accepted'
          when rep.band = 'low' then 'refused'
          when rep.band = 'middle' then 'review'
          when rep.reviewed_band = rep.band then 'accepted'
          else 'review' end as status,
        grp.file_count, grp.first_seen_at, grp.last_scored_at,
        coalesce(ever.n, 0) as ever_used,
        coalesce(now.using_now, 0) as using_now,
        coalesce(now.waiting, 0) as waiting
      from rep
      join grp using (gkey)
      left join ever using (gkey)
      left join now using (gkey)
    )
    select t.project_id, t.sha512, t.kind, t.name, t.file_count, t.platforms, t.status, t.score,
      t.decision, t.using_now, t.ever_used, t.waiting,
      (extract(epoch from t.first_seen_at) * 1000)::float8 as first_seen_ms,
      (extract(epoch from t.last_scored_at) * 1000)::float8 as last_scored_ms
    from t
    ${where.length > 0 ? sql`where ${sql.join(where, sql` and `)}` : sql``}
    order by ${order}
    limit ${PAGE_SIZE + 1} offset ${offset}`);

  const items = rows.slice(0, PAGE_SIZE).map((row): AnticheatFileRow => ({
    projectId: row.project_id,
    sha512: row.project_id ? null : row.sha512,
    kind: row.kind,
    name: row.name,
    fileCount: row.file_count,
    platforms: row.platforms,
    status: row.status,
    score: row.score,
    decision: row.decision,
    usingNow: row.using_now,
    everUsed: row.ever_used,
    waiting: row.waiting,
    firstSeenAt: new Date(row.first_seen_ms).toISOString(),
    lastScoredAt: row.last_scored_ms === null ? null : new Date(row.last_scored_ms).toISOString(),
  }));
  return { items, nextCursor: rows.length > PAGE_SIZE ? encodeOffset(offset + PAGE_SIZE) : null };
}

async function names(database: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();
  const rows = await database
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, unique));
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function history(where: SQL, cursor?: number): Promise<{ entries: AnticheatHistoryEntry[] }> {
  const rows = await db
    .select()
    .from(anticheatHistory)
    .where(and(where, cursor ? lt(anticheatHistory.id, cursor) : undefined))
    .orderBy(desc(anticheatHistory.id))
    .limit(HISTORY_LIMIT);
  const actors = await names(
    db,
    rows.map((row) => row.actorUserId),
  );
  return {
    entries: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      at: row.at.toISOString(),
      actor: row.actorUserId ? (actors.get(row.actorUserId) ?? null) : null,
      data: row.data,
    })),
  };
}

/** The detail view of a file, with the first page of the players who used it. */
async function file(sha512: string): Promise<AnticheatFileDetail> {
  const [row] = await db
    .select({ file: anticheatFile, project: anticheatProject })
    .from(anticheatFile)
    .leftJoin(anticheatProject, eq(anticheatProject.id, anticheatFile.projectId))
    .where(eq(anticheatFile.sha512, sha512));
  if (!row) refuse(404, 'notFound');
  const { file: f, project } = row;
  const [{ entries }, players, actors] = await Promise.all([
    history(eq(anticheatHistory.sha512, sha512)),
    filePlayers(sha512, {}),
    names(db, [f.decidedByUserId]),
  ]);
  return {
    sha512: f.sha512,
    kind: f.kind,
    filename: f.filename,
    declared: f.declared,
    fingerprint: f.fingerprint,
    score: f.score,
    band: f.band,
    status: fileStatus(f),
    breakdown: f.breakdown,
    rulesVersion: f.rulesVersion,
    lookupState: f.lookupState,
    facts: f.facts,
    factsDisputed: f.factsDisputed,
    platformVersion: f.platformVersion ? { ...f.platformVersion } : null,
    project: project ? { id: project.id, name: project.name, decision: project.decision } : null,
    decision: {
      decision: f.decision,
      decidedAt: iso(f.decidedAt),
      decidedBy: f.decidedByUserId ? (actors.get(f.decidedByUserId) ?? null) : null,
      note: f.decisionNote,
    },
    reviewedAt: iso(f.reviewedAt),
    reviewedBand: f.reviewedBand,
    firstSeenAt: f.firstSeenAt.toISOString(),
    lastSeenAt: f.lastSeenAt.toISOString(),
    scoredAt: iso(f.scoredAt),
    rescoreAt: iso(f.rescoreAt),
    history: entries,
    players,
  };
}

/**
 * The players who used a file, latest first. With `project`, across every file of its project.
 * `afterBan` marks a player last seen with the file after it (or its project) was banned.
 */
async function filePlayers(
  sha512: string,
  query: { project?: '1'; cursor?: string },
): Promise<Page<AnticheatFilePlayerRow>> {
  const offset = decodeOffset(query.cursor);
  const [target] = await db
    .select({ projectId: anticheatFile.projectId })
    .from(anticheatFile)
    .where(eq(anticheatFile.sha512, sha512));
  if (!target) refuse(404, 'notFound');
  const scope =
    query.project && target.projectId
      ? eq(anticheatFile.projectId, target.projectId)
      : eq(anticheatFile.sha512, sha512);

  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      username: minecraftAccount.username,
      sha512: anticheatUsage.sha512,
      firstSeenAt: anticheatUsage.firstSeenAt,
      lastSeenAt: anticheatUsage.lastSeenAt,
      sessionCount: anticheatUsage.sessionCount,
      version: anticheatUsage.lastVersion,
      afterBan: sql<boolean>`coalesce(
        (${anticheatFile.decision} = 'banned' and ${anticheatUsage.lastSeenAt} > ${anticheatFile.decidedAt})
        or (${anticheatProject.decision} = 'banned' and ${anticheatUsage.lastSeenAt} > ${anticheatProject.decidedAt}),
        false)`,
    })
    .from(anticheatUsage)
    .innerJoin(anticheatFile, eq(anticheatFile.sha512, anticheatUsage.sha512))
    .leftJoin(anticheatProject, eq(anticheatProject.id, anticheatFile.projectId))
    .innerJoin(user, eq(user.id, anticheatUsage.userId))
    .leftJoin(minecraftAccount, eq(minecraftAccount.uuid, anticheatUsage.lastMinecraftUuid))
    .where(scope)
    .orderBy(desc(anticheatUsage.lastSeenAt), anticheatUsage.userId, anticheatUsage.sha512)
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  return {
    items: rows.slice(0, PAGE_SIZE).map((row) => ({
      player: { userId: row.userId, name: row.name, username: row.username },
      sha512: row.sha512,
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      sessionCount: row.sessionCount,
      version: row.version,
      afterBan: row.afterBan,
    })),
    nextCursor: rows.length > PAGE_SIZE ? encodeOffset(offset + PAGE_SIZE) : null,
  };
}

/** A project, its decision, its stored platform metadata and its files. */
async function project(id: string): Promise<AnticheatProjectDetail> {
  const [p] = await db.select().from(anticheatProject).where(eq(anticheatProject.id, id));
  if (!p) refuse(404, 'notFound');
  const [versions, { entries }, actors] = await Promise.all([
    db
      .select()
      .from(anticheatFile)
      .where(eq(anticheatFile.projectId, id))
      .orderBy(desc(anticheatFile.firstSeenAt)),
    history(eq(anticheatHistory.projectId, id)),
    names(db, [p.decidedByUserId]),
  ]);
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    modrinthId: p.modrinthId,
    curseforgeId: p.curseforgeId,
    declaredModId: p.declaredModId,
    modIds: p.modIds,
    modrinth: p.modrinth ? { ...p.modrinth } : null,
    curseforge: p.curseforge ? { ...p.curseforge } : null,
    decision: {
      decision: p.decision,
      decidedAt: iso(p.decidedAt),
      decidedBy: p.decidedByUserId ? (actors.get(p.decidedByUserId) ?? null) : null,
      note: p.decisionNote,
    },
    files: versions.map((f) => ({
      sha512: f.sha512,
      filename: f.filename,
      version: f.platformVersion?.modrinth?.versionNumber ?? f.declared.version ?? null,
      score: f.score,
      band: f.band,
      status: fileStatus(f),
    })),
    history: entries,
  };
}

export const anticheatRegistryService = { files, file, filePlayers, project, names };
