import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';

import { db } from '~~/server/db';
import { minecraftAccount, user, wardenAppeal, wardenBan, wardenNote } from '~~/server/db/schema';

import { wardenAuditService } from './audit';
import { refuse } from './shared';
import type { Db, Tx, WardenActor } from './shared';
import { appealView, banNameIds, banView, namesOf, noteView } from './views';

import type {
  WardenAppealListItem,
  WardenAppealView,
  WardenBanBody,
  WardenBanView,
  WardenIssuer,
  WardenNoteBody,
  WardenNoteView,
} from '#shared/schemas/warden';
import { isWardenAdmin } from '#shared/utils/roles';

/** The player's active ban, if any. */
async function activeBan(userId: string, dbx: Db = db) {
  const [ban] = await dbx
    .select()
    .from(wardenBan)
    .where(
      and(
        eq(wardenBan.userId, userId),
        isNull(wardenBan.revokedAt),
        or(isNull(wardenBan.expiresAt), gt(wardenBan.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(wardenBan.createdAt))
    .limit(1);
  return ban;
}

/** The LNB user a linked Minecraft account belongs to. */
async function ownerOf(dbx: Db, uuid: string): Promise<string> {
  const [account] = await dbx
    .select({ userId: minecraftAccount.userId })
    .from(minecraftAccount)
    .where(eq(minecraftAccount.uuid, uuid));
  if (!account) refuse(404, 'notLinked');
  return account.userId;
}

/**
 * Minecraft staff behind an action from the server. Without an issuer, it's the console. With
 * one, it must be a linked account whose LNB account is a Warden admin.
 */
async function serverActor(dbx: Db, issuer: WardenIssuer | undefined): Promise<WardenActor> {
  if (!issuer) return { source: 'minecraft', userId: null, minecraft: null };
  const [staff] = await dbx
    .select({ userId: user.id, role: user.role })
    .from(minecraftAccount)
    .innerJoin(user, eq(user.id, minecraftAccount.userId))
    .where(eq(minecraftAccount.uuid, issuer.uuid));
  if (!staff || !isWardenAdmin(staff.role)) refuse(403, 'issuerNotAllowed');
  return { source: 'minecraft', userId: staff.userId, minecraft: issuer };
}

async function userExists(dbx: Db, userId: string): Promise<void> {
  const [row] = await dbx.select({ id: user.id }).from(user).where(eq(user.id, userId));
  if (!row) refuse(404, 'notFound');
}

function actorColumns(actor: WardenActor) {
  return {
    userId: actor.source === 'system' ? null : actor.userId,
    minecraftUuid: actor.source === 'minecraft' ? (actor.minecraft?.uuid ?? null) : null,
    minecraftName: actor.source === 'minecraft' ? (actor.minecraft?.username ?? null) : null,
  };
}

async function revoke(
  tx: Tx,
  ban: { id: string; userId: string },
  actor: WardenActor,
  reason: string | null,
) {
  const by = actorColumns(actor);
  const [revoked] = await tx
    .update(wardenBan)
    .set({
      revokedAt: new Date(),
      revokedByUserId: by.userId,
      revokedByMinecraftUuid: by.minecraftUuid,
      revokedByMinecraftName: by.minecraftName,
      revokeSource: actor.source,
      revokeReason: reason,
    })
    .where(eq(wardenBan.id, ban.id))
    .returning();
  await wardenAuditService.record(tx, {
    action: 'unban',
    actor,
    targetUserId: ban.userId,
    data: { banId: ban.id, reason },
  });
  return revoked!;
}

async function view(dbx: Db, ban: typeof wardenBan.$inferSelect): Promise<WardenBanView> {
  return banView(ban, await namesOf(dbx, banNameIds(ban)));
}

/**
 * Bans a player: all of their Minecraft accounts. A ban that's already active is revoked as
 * superseded, so there is one active ban at a time.
 */
async function ban(input: {
  userId: string;
  body: WardenBanBody;
  actor: WardenActor;
  minecraftUuid?: string;
}): Promise<WardenBanView> {
  return db.transaction(async (tx) => {
    await userExists(tx, input.userId);
    const current = await activeBan(input.userId, tx);
    if (current) await revoke(tx, current, input.actor, 'superseded');

    const by = actorColumns(input.actor);
    const { durationSeconds } = input.body;
    const [created] = await tx
      .insert(wardenBan)
      .values({
        userId: input.userId,
        minecraftUuid: input.minecraftUuid ?? null,
        reason: input.body.reason,
        expiresAt: durationSeconds === null ? null : new Date(Date.now() + durationSeconds * 1000),
        source: input.actor.source,
        issuedByUserId: by.userId,
        issuedByMinecraftUuid: by.minecraftUuid,
        issuedByMinecraftName: by.minecraftName,
      })
      .returning();
    await wardenAuditService.record(tx, {
      action: 'ban',
      actor: input.actor,
      targetUserId: input.userId,
      targetMinecraftUuid: input.minecraftUuid ?? null,
      data: {
        banId: created!.id,
        reason: created!.reason,
        expiresAt: created!.expiresAt?.toISOString() ?? null,
      },
    });
    return view(tx, created!);
  });
}

/** Lifts the player's active ban. */
async function unban(input: {
  userId: string;
  reason?: string;
  actor: WardenActor;
}): Promise<WardenBanView> {
  return db.transaction(async (tx) => {
    const current = await activeBan(input.userId, tx);
    if (!current) refuse(409, 'notBanned');
    return view(tx, await revoke(tx, current, input.actor, input.reason || null));
  });
}

/** Lifts one ban by its ID, from the admin panel. */
async function revokeById(input: {
  banId: string;
  reason?: string;
  actor: WardenActor;
}): Promise<WardenBanView> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(wardenBan)
      .where(eq(wardenBan.id, input.banId))
      .for('update');
    if (!row) refuse(404, 'notFound');
    if (row.revokedAt || (row.expiresAt && row.expiresAt <= new Date())) refuse(409, 'notBanned');
    return view(tx, await revoke(tx, row, input.actor, input.reason || null));
  });
}

/** Adds a private note, or a warning the player sees. */
async function addNote(input: {
  userId: string;
  body: WardenNoteBody;
  actor: WardenActor;
}): Promise<WardenNoteView> {
  return db.transaction(async (tx) => {
    await userExists(tx, input.userId);
    const by = actorColumns(input.actor);
    const [note] = await tx
      .insert(wardenNote)
      .values({
        userId: input.userId,
        kind: input.body.kind,
        body: input.body.body,
        source: input.actor.source,
        authorUserId: by.userId,
        authorMinecraftUuid: by.minecraftUuid,
        authorMinecraftName: by.minecraftName,
      })
      .returning();
    await wardenAuditService.record(tx, {
      action: input.body.kind === 'warning' ? 'warning.create' : 'note.create',
      actor: input.actor,
      targetUserId: input.userId,
      data: { noteId: note!.id },
    });
    return noteView(note!, await namesOf(tx, [by.userId]));
  });
}

/** A player appeals their active ban, once. */
async function appeal(input: {
  actorId: string;
  banId: string;
  body: string;
}): Promise<WardenAppealView> {
  return db.transaction(async (tx) => {
    const current = await activeBan(input.actorId, tx);
    if (!current || current.id !== input.banId) refuse(404, 'notFound');
    const [created] = await tx
      .insert(wardenAppeal)
      .values({ banId: input.banId, body: input.body })
      .onConflictDoNothing()
      .returning();
    if (!created) refuse(409, 'appealExists');
    await wardenAuditService.record(tx, {
      action: 'appeal.create',
      actor: { source: 'web', userId: input.actorId },
      targetUserId: input.actorId,
      data: { appealId: created.id, banId: input.banId },
    });
    return appealView(created, new Map());
  });
}

/** An admin answers an appeal. Accepting it lifts the ban. */
async function decideAppeal(input: {
  actorId: string;
  appealId: string;
  accept: boolean;
  response: string;
}): Promise<WardenAppealView> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ appeal: wardenAppeal, ban: wardenBan })
      .from(wardenAppeal)
      .innerJoin(wardenBan, eq(wardenBan.id, wardenAppeal.banId))
      .where(eq(wardenAppeal.id, input.appealId))
      .for('update');
    if (!row) refuse(404, 'notFound');
    if (row.appeal.status !== 'pending') refuse(409, 'appealClosed');

    const actor: WardenActor = { source: 'web', userId: input.actorId };
    const [decided] = await tx
      .update(wardenAppeal)
      .set({
        status: input.accept ? 'accepted' : 'rejected',
        response: input.response,
        decidedByUserId: input.actorId,
        decidedAt: new Date(),
      })
      .where(eq(wardenAppeal.id, input.appealId))
      .returning();
    await wardenAuditService.record(tx, {
      action: 'appeal.decide',
      actor,
      targetUserId: row.ban.userId,
      data: { appealId: input.appealId, banId: row.ban.id, accepted: input.accept },
    });
    const stillActive =
      !row.ban.revokedAt && (!row.ban.expiresAt || row.ban.expiresAt > new Date());
    if (input.accept && stillActive) {
      await revoke(tx, row.ban, actor, `Appeal accepted: ${input.response}`);
    }
    return appealView(decided!, await namesOf(tx, [input.actorId]));
  });
}

/** Appeals for the admin panel, newest first. */
async function listAppeals(
  status?: 'pending' | 'accepted' | 'rejected',
): Promise<WardenAppealListItem[]> {
  const rows = await db
    .select({ appeal: wardenAppeal, ban: wardenBan, name: user.name })
    .from(wardenAppeal)
    .innerJoin(wardenBan, eq(wardenBan.id, wardenAppeal.banId))
    .innerJoin(user, eq(user.id, wardenBan.userId))
    .where(status ? eq(wardenAppeal.status, status) : undefined)
    .orderBy(desc(wardenAppeal.createdAt))
    .limit(200);
  const names = await namesOf(
    db,
    rows.flatMap((row) => [...banNameIds(row.ban), row.appeal.decidedByUserId]),
  );
  return rows.map((row) => ({
    appeal: appealView(row.appeal, names),
    ban: banView(row.ban, names),
    player: { userId: row.ban.userId, name: row.name },
  }));
}

/** The UUIDs of the player's Minecraft accounts, for kick events. */
async function accountsOf(dbx: Db, userId: string): Promise<string[]> {
  const rows = await dbx
    .select({ uuid: minecraftAccount.uuid })
    .from(minecraftAccount)
    .where(eq(minecraftAccount.userId, userId));
  return rows.map((row) => row.uuid);
}

export const wardenModerationService = {
  activeBan,
  ownerOf,
  serverActor,
  ban,
  unban,
  revokeById,
  addNote,
  appeal,
  decideAppeal,
  listAppeals,
  accountsOf,
};
