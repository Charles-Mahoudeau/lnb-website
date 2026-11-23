import { and, asc, eq, gt, inArray, isNull, or } from 'drizzle-orm';

import { db } from '~~/server/db';
import { feedMember, minecraftAccount, user, wardenBan, wardenPlayer } from '~~/server/db/schema';
import type { AuditActor } from '~~/server/services/audit';
import { flagService } from '~~/server/services/flags';

import { feedReadStateService } from './read-state';
import { NO_RIGHTS, realNameOf, rightsOf } from './rules';
import { linkedAccount, refuse } from './shared';
import type { Db, FeedActor, FeedWho } from './shared';

import type { FeedAuthor, FeedMe, FeedRights, FeedServerPlayer } from '#shared/schemas/feed';

// Who may do what in Feed (docs/feed.md, Rights): decided by the site on every request, from the
// person's roles, linked Minecraft accounts and bans. The game and the browser only use rights to
// choose what to show.

/** An LNB account as Feed sees it. */
export interface FeedPerson {
  userId: string;
  name: string;
  role: string | null;
  ghost: boolean;
  /** Warden's setting; true when the person has no Warden row. */
  showRealName: boolean;
  linked: boolean;
  banned: boolean;
  /** The end of the Warden ban in force, null when permanent or not banned. */
  wardenBanExpiresAt: Date | null;
  rights: FeedRights;
}

/** Whoever a view is computed for: an LNB account and its rights, or a guest. */
export interface FeedViewer {
  userId: string | null;
  rights: FeedRights;
  /** Whether `canDelete` shows on others' posts: for moderators in game, never in the browser. */
  deletesOthers: boolean;
}

export const GUEST: FeedViewer = { userId: null, rights: NO_RIGHTS, deletesOthers: false };

/** These LNB accounts, with their rights now. Unknown IDs are left out. */
async function people(dbx: Db, userIds: readonly string[]): Promise<Map<string, FeedPerson>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const now = new Date();
  // One after the other: `dbx` may be a transaction, which runs one query at a time.
  const users = await dbx
    .select({
      id: user.id,
      name: user.name,
      role: user.role,
      ghost: user.ghost,
      banned: user.banned,
      banExpires: user.banExpires,
      showRealName: wardenPlayer.showRealName,
    })
    .from(user)
    .leftJoin(wardenPlayer, eq(wardenPlayer.userId, user.id))
    .where(inArray(user.id, ids));
  const linked = await dbx
    .selectDistinct({ userId: minecraftAccount.userId })
    .from(minecraftAccount)
    .where(and(inArray(minecraftAccount.userId, ids), isNull(minecraftAccount.unlinkedAt)));
  const bans = await dbx
    .select({ userId: wardenBan.userId, expiresAt: wardenBan.expiresAt })
    .from(wardenBan)
    .where(
      and(
        inArray(wardenBan.userId, ids),
        isNull(wardenBan.revokedAt),
        or(isNull(wardenBan.expiresAt), gt(wardenBan.expiresAt, now)),
      ),
    );
  const linkedIds = new Set(linked.map((row) => row.userId));
  const wardenBans = new Map<string, Date | null>();
  for (const ban of bans) {
    const known = wardenBans.get(ban.userId);
    // A permanent ban (null) wins over any end; otherwise the latest end.
    if (known === null) continue;
    wardenBans.set(
      ban.userId,
      ban.expiresAt === null || known === undefined || ban.expiresAt > known
        ? ban.expiresAt
        : known,
    );
  }
  return new Map(
    users.map((row) => {
      const siteBanned = row.banned === true && (!row.banExpires || row.banExpires > now);
      const banned = siteBanned || wardenBans.has(row.id);
      const linked = linkedIds.has(row.id);
      return [
        row.id,
        {
          userId: row.id,
          name: row.name,
          role: row.role,
          ghost: row.ghost,
          showRealName: row.showRealName ?? true,
          linked,
          banned,
          wardenBanExpiresAt: wardenBans.get(row.id) ?? null,
          rights: rightsOf({ linked, banned, role: row.role }),
        },
      ];
    }),
  );
}

async function person(dbx: Db, userId: string): Promise<FeedPerson | null> {
  return (await people(dbx, [userId])).get(userId) ?? null;
}

/** How a post shows its author, from the account it came from and the person's names now. */
export function authorBlock(
  who: Pick<FeedPerson, 'name' | 'showRealName' | 'rights'>,
  account: { uuid: string; username: string },
): FeedAuthor {
  return {
    uuid: account.uuid,
    username: account.username,
    realName: realNameOf(who.name, who.showRealName),
    announcer: who.rights.announce,
  };
}

/** The viewer behind a reader: a linked player's account, a signed-in person, or a guest. */
async function viewer(dbx: Db, who: FeedWho): Promise<FeedViewer> {
  const userId = 'userId' in who ? who.userId : (await linkedAccount(dbx, who.player))?.userId;
  if (!userId) return GUEST;
  const found = await person(dbx, userId);
  if (!found) return GUEST;
  // In the browser, moderators delete others' posts from the admin only (docs/feed.md, Deleting).
  return { userId, rights: found.rights, deletesOthers: 'player' in who && found.rights.moderate };
}

/** The viewers behind many players at once, keyed by UUID. Unlinked ones are guests. */
async function viewersOfPlayers(
  dbx: Db,
  uuids: readonly string[],
): Promise<Map<string, FeedViewer>> {
  const accounts = uuids.length
    ? await dbx
        .select({ uuid: minecraftAccount.uuid, userId: minecraftAccount.userId })
        .from(minecraftAccount)
        .where(and(inArray(minecraftAccount.uuid, [...uuids]), isNull(minecraftAccount.unlinkedAt)))
    : [];
  const found = await people(
    dbx,
    accounts.map((row) => row.userId),
  );
  const ownerOf = new Map(accounts.map((row) => [row.uuid, row.userId]));
  return new Map(
    uuids.map((uuid) => {
      const userId = ownerOf.get(uuid);
      const known = userId ? found.get(userId) : undefined;
      return [
        uuid,
        known
          ? { userId: known.userId, rights: known.rights, deletesOthers: known.rights.moderate }
          : GUEST,
      ];
    }),
  );
}

/** The linked Minecraft accounts of these LNB accounts, earliest linked first. */
async function accountsOf(dbx: Db, userIds: readonly string[]) {
  if (!userIds.length) return [];
  return dbx
    .select({
      uuid: minecraftAccount.uuid,
      username: minecraftAccount.username,
      userId: minecraftAccount.userId,
    })
    .from(minecraftAccount)
    .where(and(inArray(minecraftAccount.userId, [...userIds]), isNull(minecraftAccount.unlinkedAt)))
    .orderBy(asc(minecraftAccount.linkedAt), asc(minecraftAccount.uuid));
}

/**
 * The browser's posting account: the chosen one while it is linked to this account, else the
 * earliest linked one still linked, else none.
 */
async function postingAccount(dbx: Db, userId: string) {
  const accounts = await accountsOf(dbx, [userId]);
  const [member] = await dbx
    .select({ uuid: feedMember.postingMinecraftUuid })
    .from(feedMember)
    .where(eq(feedMember.userId, userId));
  const chosen = accounts.find((account) => account.uuid === member?.uuid);
  const effective = chosen ?? accounts[0];
  return effective ? { uuid: effective.uuid, username: effective.username } : null;
}

/** Someone who writes, resolved: their account, rights and how the audit log names them. */
export interface FeedWriter {
  userId: string;
  person: FeedPerson;
  /** The Minecraft account it acts from: the player's, or the browser's posting account. */
  account: { uuid: string; username: string } | null;
  auditActor: AuditActor;
}

/**
 * The person behind an action. A player must be on a linked account (404 `notLinked`); in the
 * browser, `needAccount` asks for the posting account (posts and replies) or any linked account
 * (likes, pins), with the same refusal.
 */
async function writer(
  dbx: Db,
  actor: FeedActor,
  needAccount: 'posting' | 'linked' | 'none',
): Promise<FeedWriter> {
  if (actor.source === 'server') {
    const account = await linkedAccount(dbx, actor.player);
    if (!account) refuse(404, 'notLinked');
    const found = await person(dbx, account.userId);
    if (!found) refuse(404, 'notLinked');
    return {
      userId: account.userId,
      person: found,
      account: { uuid: account.uuid, username: account.username },
      auditActor: {
        source: 'minecraft',
        userId: account.userId,
        minecraft: { uuid: account.uuid, username: account.username },
      },
    };
  }
  const found = await person(dbx, actor.userId);
  if (!found) refuse(404, 'notLinked');
  const account = needAccount === 'posting' ? await postingAccount(dbx, actor.userId) : null;
  if (needAccount === 'posting' && !account) refuse(404, 'notLinked');
  if (needAccount === 'linked' && !found.linked) refuse(404, 'notLinked');
  return {
    userId: actor.userId,
    person: found,
    account,
    auditActor: { source: 'web', userId: actor.userId },
  };
}

/** A player's state for the game (`GET /api/feed/server/players/:uuid`). Any UUID. */
async function playerState(uuid: string): Promise<FeedServerPlayer> {
  const writing = await flagService.isEnabled('feed.writing');
  const account = await linkedAccount(db, uuid);
  const found = account ? await person(db, account.userId) : null;
  if (!account || !found) {
    return {
      linked: false,
      banned: false,
      writing,
      me: null,
      rights: NO_RIGHTS,
      unread: { announcements: false, global: false },
    };
  }
  return {
    linked: true,
    banned: found.banned,
    writing,
    me: authorBlock(found, account),
    rights: found.rights,
    unread: await feedReadStateService.unread(db, account.userId),
  };
}

/** The signed-in person's state for the browser (`GET /api/feed/me`). */
async function me(userId: string): Promise<FeedMe> {
  const [found, accounts, posting, writing, unread] = await Promise.all([
    person(db, userId),
    accountsOf(db, [userId]),
    postingAccount(db, userId),
    flagService.isEnabled('feed.writing'),
    feedReadStateService.unread(db, userId),
  ]);
  if (!found) refuse(404, 'notFound');
  return {
    linked: found.linked,
    banned: found.banned,
    banExpiresAt: found.wardenBanExpiresAt?.toISOString() ?? null,
    writing,
    rights: found.rights,
    me: posting ? authorBlock(found, posting) : null,
    unread,
    accounts: accounts.map((account) => ({ uuid: account.uuid, username: account.username })),
    postingAccount: posting?.uuid ?? null,
  };
}

/** Picks the browser's posting account, one of the person's linked ones (404 `notLinked`). */
async function setPostingAccount(userId: string, uuid: string): Promise<FeedMe> {
  const account = await linkedAccount(db, uuid);
  if (!account || account.userId !== userId) refuse(404, 'notLinked');
  const now = new Date();
  await db
    .insert(feedMember)
    .values({ userId, postingMinecraftUuid: account.uuid, updatedAt: now })
    .onConflictDoUpdate({
      target: feedMember.userId,
      set: { postingMinecraftUuid: account.uuid, updatedAt: now },
    });
  return me(userId);
}

export const feedRightsService = {
  people,
  person,
  viewer,
  viewersOfPlayers,
  accountsOf,
  postingAccount,
  writer,
  playerState,
  me,
  setPostingAccount,
};
