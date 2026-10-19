import { and, asc, eq, gt, ilike, isNull, notExists, or, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import { teamMember, teamPole, teamSetting, user } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';
import { avatarService } from '~~/server/services/avatars';
import { flagService } from '~~/server/services/flags';

import type {
  TeamAdminMember,
  TeamAdminPole,
  TeamAdminView,
  TeamMeView,
  TeamMemberBody,
  TeamMemberPatchBody,
  TeamPoleBody,
  TeamPolePatchBody,
  TeamProblem,
  TeamPublicPole,
  TeamPublicView,
  TeamUserOption,
} from '#shared/schemas/team';
import { schoolForTenant } from '#shared/utils/schools';
import { publicTeamPhoto } from '#shared/utils/team';

// The team page at /team: poles, the accounts in them, and where "Join the team" leads. Name,
// photo and school always come from the account. A member shows publicly when managers left them
// visible, they didn't switch themselves off, and no site ban is in force. See docs/team.md.

const AVATAR_PREFIX = '/api/avatars/';

function refuse(status: number, problem: TeamProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

function banInForce(now: Date) {
  return and(eq(user.banned, true), or(isNull(user.banExpires), gt(user.banExpires, now)));
}

/** The condition for a member to appear on the public page. */
function shownWhere(now: Date) {
  return and(eq(teamMember.visible, true), eq(teamMember.showSelf, true), notBanned(now));
}

function notBanned(now: Date) {
  return sql`NOT coalesce(${banInForce(now)}, false)`;
}

type PoleRow = typeof teamPole.$inferSelect;

function poleBase(row: PoleRow) {
  return {
    id: row.id,
    icon: row.icon,
    featured: row.featured,
    name: { en: row.nameEn, fr: row.nameFr },
    description: { en: row.descriptionEn, fr: row.descriptionFr },
  };
}

// Public page

async function listPublic(now = new Date()): Promise<TeamPublicView> {
  const rows = await db
    .select({
      pole: teamPole,
      member: teamMember,
      name: user.name,
      image: user.image,
      tenantId: user.tenantId,
    })
    .from(teamMember)
    .innerJoin(teamPole, eq(teamPole.id, teamMember.poleId))
    .innerJoin(user, eq(user.id, teamMember.userId))
    .where(shownWhere(now))
    .orderBy(asc(teamPole.position), asc(teamMember.position), asc(teamMember.createdAt));

  const poles = new Map<string, TeamPublicPole>();
  for (const row of rows) {
    let pole = poles.get(row.pole.id);
    if (!pole) {
      pole = { ...poleBase(row.pole), members: [] };
      poles.set(row.pole.id, pole);
    }
    pole.members.push({
      id: row.member.userId,
      name: row.name,
      school: schoolForTenant(row.tenantId) ?? null,
      image: publicTeamPhoto(row.image),
      role: { en: row.member.roleEn, fr: row.member.roleFr },
      bio: { en: row.member.bioEn, fr: row.member.bioFr },
    });
  }

  const [setting] = await db.select().from(teamSetting);
  const joinUrl = (await flagService.isEnabled('team.join')) ? (setting?.joinUrl ?? null) : null;
  return { poles: [...poles.values()], joinUrl };
}

/** A visible member's stored photo, or undefined. Other people's photos never leave this way. */
async function photo(key: string, now = new Date()): Promise<Buffer | undefined> {
  const [row] = await db
    .select({ userId: teamMember.userId })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .where(and(shownWhere(now), eq(user.image, AVATAR_PREFIX + key)))
    .limit(1);
  return row ? avatarService.get(key) : undefined;
}

// A member's own switch

async function me(userId: string): Promise<TeamMeView> {
  const [row] = await db
    .select({ showSelf: teamMember.showSelf })
    .from(teamMember)
    .where(eq(teamMember.userId, userId));
  return { member: !!row, showSelf: row?.showSelf ?? true };
}

async function setShowSelf(userId: string, showSelf: boolean): Promise<TeamMeView> {
  const [row] = await db
    .update(teamMember)
    .set({ showSelf })
    .where(eq(teamMember.userId, userId))
    .returning({ showSelf: teamMember.showSelf });
  if (!row) refuse(404, 'memberNotFound');
  return { member: true, showSelf: row.showSelf };
}

// Admin

async function listAdmin(now = new Date()): Promise<TeamAdminView> {
  const poleRows = await db.select().from(teamPole).orderBy(asc(teamPole.position));
  const memberRows = await db
    .select({
      member: teamMember,
      name: user.name,
      email: user.email,
      image: user.image,
      tenantId: user.tenantId,
      banned: sql<boolean>`coalesce(${banInForce(now)}, false)`,
    })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .orderBy(asc(teamMember.position), asc(teamMember.createdAt));

  const poles: TeamAdminPole[] = poleRows.map((row) => ({ ...poleBase(row), members: [] }));
  for (const row of memberRows) {
    const member: TeamAdminMember = {
      userId: row.member.userId,
      name: row.name,
      email: row.email,
      school: schoolForTenant(row.tenantId) ?? null,
      image: row.image,
      role: { en: row.member.roleEn, fr: row.member.roleFr },
      bio: { en: row.member.bioEn, fr: row.member.bioFr },
      visible: row.member.visible,
      showSelf: row.member.showSelf,
      banned: row.banned,
    };
    poles.find((pole) => pole.id === row.member.poleId)?.members.push(member);
  }

  const [setting] = await db.select().from(teamSetting);
  return { poles, joinUrl: setting?.joinUrl ?? null };
}

/** Accounts by name or email that aren't on the team yet. */
async function searchUsers(q: string): Promise<TeamUserOption[]> {
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      tenantId: user.tenantId,
    })
    .from(user)
    .where(
      and(
        or(ilike(user.name, pattern), ilike(user.email, pattern)),
        notExists(
          db
            .select({ one: sql`1` })
            .from(teamMember)
            .where(eq(teamMember.userId, user.id)),
        ),
      ),
    )
    .orderBy(asc(user.name))
    .limit(10);
  return rows.map((row) => ({
    userId: row.id,
    name: row.name,
    email: row.email,
    school: schoolForTenant(row.tenantId) ?? null,
    image: row.image,
  }));
}

// Poles

async function nextPolePosition(tx: Tx): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(${teamPole.position}), 0)` })
    .from(teamPole);
  return (row?.max ?? 0) + 1;
}

async function createPole(input: { actorId: string; body: TeamPoleBody }): Promise<{ id: string }> {
  const { body } = input;
  return db.transaction(async (tx) => {
    if (body.featured) await tx.update(teamPole).set({ featured: false });
    const [row] = await tx
      .insert(teamPole)
      .values({
        nameEn: body.name.en,
        nameFr: body.name.fr,
        descriptionEn: body.description.en,
        descriptionFr: body.description.fr,
        icon: body.icon,
        featured: body.featured,
        position: await nextPolePosition(tx),
      })
      .returning();
    await adminAuditService.record(tx, {
      action: 'teamPole.create',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row!.id, name: row!.nameEn },
    });
    return { id: row!.id };
  });
}

async function updatePole(input: {
  actorId: string;
  id: string;
  patch: TeamPolePatchBody;
}): Promise<void> {
  const { patch } = input;
  await db.transaction(async (tx) => {
    // Featuring a pole un-features the one that was.
    if (patch.featured) await tx.update(teamPole).set({ featured: false });
    const [row] = await tx
      .update(teamPole)
      .set({
        nameEn: patch.name?.en,
        nameFr: patch.name?.fr,
        descriptionEn: patch.description?.en,
        descriptionFr: patch.description?.fr,
        icon: patch.icon,
        featured: patch.featured,
      })
      .where(eq(teamPole.id, input.id))
      .returning();
    if (!row) refuse(404, 'poleNotFound');
    await adminAuditService.record(tx, {
      action: 'teamPole.update',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row.id, name: row.nameEn, patch },
    });
  });
}

async function deletePole(input: { actorId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const [used] = await tx
      .select({ userId: teamMember.userId })
      .from(teamMember)
      .where(eq(teamMember.poleId, input.id))
      .limit(1);
    if (used) refuse(409, 'hasMembers');
    const [row] = await tx.delete(teamPole).where(eq(teamPole.id, input.id)).returning();
    if (!row) refuse(404, 'poleNotFound');
    await adminAuditService.record(tx, {
      action: 'teamPole.delete',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row.id, name: row.nameEn },
    });
  });
}

/** Swaps a pole with its neighbour. At the end of the list, nothing happens. */
async function movePole(id: string, direction: 'up' | 'down'): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: teamPole.id })
      .from(teamPole)
      .orderBy(asc(teamPole.position), asc(teamPole.createdAt))
      .for('update');
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) refuse(404, 'poleNotFound');
    const other = direction === 'up' ? index - 1 : index + 1;
    if (other < 0 || other >= rows.length) return;
    [rows[index], rows[other]] = [rows[other]!, rows[index]!];
    for (const [position, row] of rows.entries()) {
      await tx.update(teamPole).set({ position }).where(eq(teamPole.id, row.id));
    }
  });
}

// Members

async function nextMemberPosition(tx: Tx, poleId: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(${teamMember.position}), 0)` })
    .from(teamMember)
    .where(eq(teamMember.poleId, poleId));
  return (row?.max ?? 0) + 1;
}

async function addMember(input: { actorId: string; body: TeamMemberBody }): Promise<void> {
  const { body } = input;
  try {
    await db.transaction(async (tx) => {
      const [account] = await tx.select({ id: user.id }).from(user).where(eq(user.id, body.userId));
      if (!account) refuse(404, 'userNotFound');
      const [pole] = await tx
        .select({ id: teamPole.id })
        .from(teamPole)
        .where(eq(teamPole.id, body.poleId));
      if (!pole) refuse(404, 'poleNotFound');
      await tx.insert(teamMember).values({
        userId: body.userId,
        poleId: body.poleId,
        roleEn: body.role.en,
        roleFr: body.role.fr,
        bioEn: body.bio.en,
        bioFr: body.bio.fr,
        visible: body.visible,
        position: await nextMemberPosition(tx, body.poleId),
      });
      await adminAuditService.record(tx, {
        action: 'teamMember.add',
        actorUserId: input.actorId,
        targetUserId: body.userId,
        data: { poleId: body.poleId },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) refuse(409, 'alreadyMember');
    throw error;
  }
}

async function updateMember(input: {
  actorId: string;
  userId: string;
  patch: TeamMemberPatchBody;
}): Promise<void> {
  const { patch } = input;
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ poleId: teamMember.poleId })
      .from(teamMember)
      .where(eq(teamMember.userId, input.userId));
    if (!current) refuse(404, 'memberNotFound');
    // Moving to another pole puts them last there.
    let position: number | undefined;
    if (patch.poleId && patch.poleId !== current.poleId) {
      const [pole] = await tx
        .select({ id: teamPole.id })
        .from(teamPole)
        .where(eq(teamPole.id, patch.poleId));
      if (!pole) refuse(404, 'poleNotFound');
      position = await nextMemberPosition(tx, patch.poleId);
    }
    await tx
      .update(teamMember)
      .set({
        poleId: patch.poleId,
        position,
        roleEn: patch.role?.en,
        roleFr: patch.role?.fr,
        bioEn: patch.bio?.en,
        bioFr: patch.bio?.fr,
        visible: patch.visible,
      })
      .where(eq(teamMember.userId, input.userId));
    await adminAuditService.record(tx, {
      action: 'teamMember.update',
      actorUserId: input.actorId,
      targetUserId: input.userId,
      data: { patch },
    });
  });
}

async function removeMember(input: { actorId: string; userId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(teamMember)
      .where(eq(teamMember.userId, input.userId))
      .returning({ poleId: teamMember.poleId });
    if (!row) refuse(404, 'memberNotFound');
    await adminAuditService.record(tx, {
      action: 'teamMember.remove',
      actorUserId: input.actorId,
      targetUserId: input.userId,
      data: { poleId: row.poleId },
    });
  });
}

/** Swaps a member with their neighbour in the same pole. */
async function moveMember(userId: string, direction: 'up' | 'down'): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ poleId: teamMember.poleId })
      .from(teamMember)
      .where(eq(teamMember.userId, userId));
    if (!current) refuse(404, 'memberNotFound');
    const rows = await tx
      .select({ userId: teamMember.userId })
      .from(teamMember)
      .where(eq(teamMember.poleId, current.poleId))
      .orderBy(asc(teamMember.position), asc(teamMember.createdAt))
      .for('update');
    const index = rows.findIndex((row) => row.userId === userId);
    const other = direction === 'up' ? index - 1 : index + 1;
    if (other < 0 || other >= rows.length) return;
    [rows[index], rows[other]] = [rows[other]!, rows[index]!];
    for (const [position, row] of rows.entries()) {
      await tx.update(teamMember).set({ position }).where(eq(teamMember.userId, row.userId));
    }
  });
}

// Settings

async function setSettings(input: {
  actorId: string;
  settings: { joinUrl: string | null };
}): Promise<void> {
  const { joinUrl } = input.settings;
  await db.transaction(async (tx) => {
    await tx
      .insert(teamSetting)
      .values({ id: 1, joinUrl })
      .onConflictDoUpdate({ target: teamSetting.id, set: { joinUrl } });
    await adminAuditService.record(tx, {
      action: 'team.settings',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { joinUrl },
    });
  });
}

export const teamService = {
  listPublic,
  photo,
  me,
  setShowSelf,
  listAdmin,
  searchUsers,
  createPole,
  updatePole,
  deletePole,
  movePole,
  addMember,
  updateMember,
  removeMember,
  moveMember,
  setSettings,
};
