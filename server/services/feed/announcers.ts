import { asc, eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { user } from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';
import type { AuditActor } from '~~/server/services/audit';
import { roleMatch } from '~~/server/services/people/access';

import { feedEvents } from './events';
import { feedRightsService } from './rights';
import { realNameOf } from './rules';
import { linkedAccount, refuse } from './shared';
import type { Tx } from './shared';

import type {
  FeedAnnouncerList,
  FeedAnnouncerState,
  FeedServerAnnouncer,
} from '#shared/schemas/feed';
import type { WardenIssuer } from '#shared/schemas/warden';
import {
  FEED_ANNOUNCER_ROLE,
  hasRole,
  isFeedAnnouncer,
  isFeedModerator,
  withRole,
} from '#shared/utils/roles';

// The `feed-announcer` role (docs/feed.md, "Granting the announcer role"), given or taken by
// moderators from the admin, or in game by `/feed announcer`. Moderators announce by role: giving
// them the role changes nothing, taking it from them is refused. A real change is audited and
// tells the Minecraft server to read the person's rights again.

/**
 * Sets the role in the caller's transaction. Returns whether it changed, and whether the person
 * announces as a moderator anyway.
 */
async function setRole(
  tx: Tx,
  input: { userId: string; announcer: boolean; actor: AuditActor },
): Promise<{ changed: boolean; viaRole: boolean }> {
  const [target] = await tx
    .select({ id: user.id, role: user.role, ghost: user.ghost })
    .from(user)
    .where(eq(user.id, input.userId))
    .for('update');
  if (!target) refuse(404, 'notFound');
  if (target.ghost) refuse(409, 'isGhost');
  const viaRole = isFeedModerator(target.role);
  if (viaRole) {
    if (!input.announcer) refuse(409, 'impliedByRole');
    return { changed: false, viaRole };
  }
  if (hasRole(target.role, FEED_ANNOUNCER_ROLE) === input.announcer) {
    return { changed: false, viaRole };
  }
  await tx
    .update(user)
    .set({ role: withRole(target.role, FEED_ANNOUNCER_ROLE, input.announcer) })
    .where(eq(user.id, target.id));
  await auditService.record(tx, {
    action: 'minecraft.feed.announcer',
    actor: input.actor,
    targetUserId: target.id,
    data: { announcer: input.announcer },
  });
  return { changed: true, viaRole };
}

/**
 * Whether the person is an announcer, for the Person page's switch and header pill: they hold the
 * role, or a moderator role that implies it. The role, not the right: a ban or the lack of a
 * linked account takes the right away but leaves the role, which the switch must show to be
 * turned off.
 */
async function get(userId: string): Promise<FeedAnnouncerState> {
  const [target] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId));
  if (!target) refuse(404, 'notFound');
  const viaRole = isFeedModerator(target.role);
  return { userId, announcer: isFeedAnnouncer(target.role), viaRole };
}

/** From the admin's Person page, by a moderator. */
async function setFromAdmin(input: {
  actorId: string;
  userId: string;
  announcer: boolean;
}): Promise<FeedAnnouncerState> {
  const { changed } = await db.transaction((tx) =>
    setRole(tx, {
      userId: input.userId,
      announcer: input.announcer,
      actor: { source: 'web', userId: input.actorId },
    }),
  );
  if (changed) await feedEvents.rightsOfUsers([input.userId]);
  return get(input.userId);
}

/**
 * From `/feed announcer add|remove` in game. With an issuer, it must be a linked account whose LNB
 * account moderates (403 `issuerNotAllowed`); without one, it is the server console.
 */
async function setFromServer(input: {
  uuid: string;
  announcer: boolean;
  issuer?: WardenIssuer;
}): Promise<FeedServerAnnouncer> {
  let actor: AuditActor = { source: 'minecraft', userId: null, minecraft: null };
  if (input.issuer) {
    const issuer = await linkedAccount(db, input.issuer.uuid);
    const person = issuer ? await feedRightsService.person(db, issuer.userId) : null;
    if (!issuer || !person?.rights.moderate) refuse(403, 'issuerNotAllowed');
    actor = { source: 'minecraft', userId: issuer.userId, minecraft: input.issuer };
  }
  const target = await linkedAccount(db, input.uuid);
  if (!target) refuse(404, 'notLinked');
  const { changed, viaRole } = await db.transaction((tx) =>
    setRole(tx, { userId: target.userId, announcer: input.announcer, actor }),
  );
  if (changed) await feedEvents.rightsOfUsers([target.userId]);
  const person = await feedRightsService.person(db, target.userId);
  return {
    uuid: target.uuid,
    username: target.username,
    announcer: person?.rights.announce ?? false,
    viaRole,
  };
}

/** The people with the role, for `/feed announcer list`. Moderators announce by role: not listed. */
async function list(): Promise<FeedAnnouncerList> {
  const rows = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(roleMatch(FEED_ANNOUNCER_ROLE))
    .orderBy(asc(user.name), asc(user.id));
  const ids = rows.filter((row) => !isFeedModerator(row.role)).map((row) => row.id);
  const [people, accounts] = await Promise.all([
    feedRightsService.people(db, ids),
    feedRightsService.accountsOf(db, ids),
  ]);
  return {
    items: ids.flatMap((id) => {
      const person = people.get(id);
      if (!person) return [];
      return [
        {
          realName: realNameOf(person.name, person.showRealName),
          accounts: accounts
            .filter((account) => account.userId === id)
            .map((account) => ({ uuid: account.uuid, username: account.username })),
        },
      ];
    }),
  };
}

export const feedAnnouncerService = { get, setFromAdmin, setFromServer, list };
