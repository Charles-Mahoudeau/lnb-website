import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { audit, feedMember, minecraftAccount, user, wardenBan } from '~~/server/db/schema';
import { feedAnnouncerService } from '~~/server/services/feed/announcers';
import { feedLikeService } from '~~/server/services/feed/likes';
import { feedPinService } from '~~/server/services/feed/pins';
import { feedPostService } from '~~/server/services/feed/posts';
import { feedReadStateService } from '~~/server/services/feed/read-state';
import { feedRightsService } from '~~/server/services/feed/rights';
import { feedLimits } from '~~/server/services/feed/shared';
import { feedViewService } from '~~/server/services/feed/views';
import { wardenAdminService } from '~~/server/services/warden/admin';
import { wardenModerationService } from '~~/server/services/warden/moderation';

import {
  eventsSince,
  latestEvent,
  person,
  post,
  problemOf,
  reply,
  server,
  setFlags,
  viewOf,
  wipe,
} from './feed-helpers';
import type { Person } from './feed-helpers';

// The rights table of docs/feed.md ("Rights"), row by row, as GET /players/:uuid reads it and as
// every action enforces it: guest, linked, banned, announcer, moderator, and an author while
// banned. Then the in-game announcer command (feed-mod.md 4.14) with its issuers and targets.

const DAY = 86_400_000;

async function wardenBanOf(who: Person, expiresAt: Date | null = null, revokedAt?: Date) {
  await db.insert(wardenBan).values({
    userId: who.id,
    reason: 'Spam',
    source: 'web',
    expiresAt,
    ...(revokedAt ? { revokedAt } : {}),
  } as typeof wardenBan.$inferInsert);
}

/** What a player may try, each as the code it answers, or 'ok'. */
async function attempts(
  who: { uuid: string },
  targets: { own: string; other: string; announcement: string },
) {
  const code = async (promise: Promise<unknown>) => (await problemOf(promise))?.problem ?? 'ok';
  return {
    postGlobal: await code(post(who, 'Global')),
    postAnnouncement: await code(post(who, 'Annonce', { feed: 'announcements' })),
    reply: await code(reply(who, targets.other)),
    like: await code(
      feedLikeService.setLiked({ actor: server(who), postId: targets.other, liked: true }),
    ),
    pin: await code(feedPinService.pin({ actor: server(who), postId: targets.announcement })),
    unpin: await code(feedPinService.unpin({ actor: server(who), postId: targets.announcement })),
  };
}

describe('Feed rights', () => {
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
  });

  describe('the rights table, row by row', () => {
    let lune: Person;
    let camille: Person;
    let targets: { own: string; other: string; announcement: string };

    beforeEach(async () => {
      lune = await person('Lune Garnier', { role: 'warden-admin' });
      camille = await person('Camille Roux');
      targets = {
        own: '',
        other: (await post(camille, 'Fil')).post.id,
        announcement: (await post(lune, 'Annonce', { feed: 'announcements' })).post.id,
      };
    });

    it('a guest reads both feeds and threads, and nothing else', async () => {
      const guest = { uuid: randomUUID() };
      expect(await feedRightsService.playerState(guest.uuid)).toEqual({
        linked: false,
        banned: false,
        writing: true,
        me: null,
        rights: { write: false, announce: false, moderate: false },
        unread: { announcements: false, global: false },
      });
      const page = await feedViewService.page({ who: { player: guest.uuid }, feed: 'global' });
      expect(page.posts.map((row) => row.id)).toEqual([targets.other]);
      expect(page.posts[0]).toMatchObject({
        liked: false,
        mine: false,
        canDelete: false,
        canPin: false,
        unseenReplies: 0,
        answersMe: false,
      });
      await feedViewService.thread({ who: { player: guest.uuid }, id: targets.other });
      expect(await attempts(guest, targets)).toEqual({
        postGlobal: 'notLinked',
        postAnnouncement: 'notLinked',
        reply: 'notLinked',
        like: 'notLinked',
        pin: 'notLinked',
        unpin: 'notLinked',
      });
      expect(
        await problemOf(feedPostService.remove({ actor: server(guest), postId: targets.other })),
      ).toMatchObject({ status: 404, problem: 'notLinked' });
    });

    it('a linked player writes in Global, replies and likes, and deletes only their own', async () => {
      const mika = await person('Mika Lefort');
      expect(await feedRightsService.playerState(mika.uuid)).toMatchObject({
        linked: true,
        banned: false,
        me: { uuid: mika.uuid, username: mika.username, realName: 'Mika L.', announcer: false },
        rights: { write: true, announce: false, moderate: false },
      });
      expect(await attempts(mika, targets)).toEqual({
        postGlobal: 'ok',
        postAnnouncement: 'notAllowed',
        reply: 'ok',
        like: 'ok',
        pin: 'notAllowed',
        unpin: 'notAllowed',
      });
      expect(
        await problemOf(feedPostService.remove({ actor: server(mika), postId: targets.other })),
      ).toMatchObject({ status: 403, problem: 'notAllowed' });
      expect(await viewOf(mika, targets.other)).toMatchObject({ canDelete: false, canPin: false });
      expect(await viewOf(mika, targets.announcement)).toMatchObject({ canPin: false });
    });

    it('an announcer posts announcements and pins, but deletes only their own', async () => {
      const kael = await person('Kael Dubois', { role: 'feed-announcer' });
      expect((await feedRightsService.playerState(kael.uuid)).rights).toEqual({
        write: true,
        announce: true,
        moderate: false,
      });
      expect(await attempts(kael, targets)).toEqual({
        postGlobal: 'ok',
        postAnnouncement: 'ok',
        reply: 'ok',
        like: 'ok',
        pin: 'ok',
        unpin: 'ok',
      });
      expect(
        await problemOf(
          feedPostService.remove({ actor: server(kael), postId: targets.announcement }),
        ),
      ).toMatchObject({ status: 403, problem: 'notAllowed' });
      expect(await viewOf(kael, targets.announcement)).toMatchObject({
        canPin: true,
        canDelete: false,
      });
      // Global posts and replies are never pinnable, so canPin stays false there.
      expect(await viewOf(kael, targets.other)).toMatchObject({ canPin: false });
      const { post: answer } = await reply(kael, targets.announcement);
      expect(answer.canPin).toBe(false);
    });

    it.each(['warden-admin', 'admin'])(
      'a %s announces and moderates: deletes anything, with the audit',
      async (role) => {
        const mod = await person('Modo Test', { role });
        expect((await feedRightsService.playerState(mod.uuid)).rights).toEqual({
          write: true,
          announce: true,
          moderate: true,
        });
        expect(await attempts(mod, targets)).toEqual({
          postGlobal: 'ok',
          postAnnouncement: 'ok',
          reply: 'ok',
          like: 'ok',
          pin: 'ok',
          unpin: 'ok',
        });
        expect(await viewOf(mod, targets.other)).toMatchObject({ canDelete: true, mine: false });
        await feedPostService.remove({ actor: server(mod), postId: targets.other });
        const [entry] = await db
          .select()
          .from(audit)
          .where(eq(audit.action, 'minecraft.feed.delete'));
        expect(entry).toMatchObject({ actorUserId: mod.id, targetUserId: camille.id });
      },
    );

    it('a Warden-banned player reads, deletes their own, and does nothing else', async () => {
      const { post: own } = await post(camille, 'À moi');
      const { post: ownReply } = await reply(camille, targets.announcement);
      await wardenBanOf(camille);
      expect(await feedRightsService.playerState(camille.uuid)).toMatchObject({
        linked: true,
        banned: true,
        me: { uuid: camille.uuid },
        rights: { write: false, announce: false, moderate: false },
      });
      expect(await attempts(camille, { ...targets, other: targets.announcement })).toEqual({
        postGlobal: 'banned',
        postAnnouncement: 'banned',
        reply: 'banned',
        like: 'banned',
        pin: 'banned',
        unpin: 'banned',
      });
      // Reads still work, and the author keeps the delete button on their own posts.
      expect(await viewOf(camille, own.id)).toMatchObject({ mine: true, canDelete: true });
      await feedPostService.remove({ actor: server(camille), postId: ownReply.id });
      await feedPostService.remove({ actor: server(camille), postId: own.id });
      // Nothing an author deletes is audited.
      expect(
        await db.select().from(audit).where(eq(audit.action, 'minecraft.feed.delete')),
      ).toEqual([]);
    });

    it('a banned moderator loses announce and moderate, and deletes only their own', async () => {
      const { post: own } = await post(lune, 'À moi');
      await wardenBanOf(lune);
      expect((await feedRightsService.playerState(lune.uuid)).rights).toEqual({
        write: false,
        announce: false,
        moderate: false,
      });
      expect(
        await problemOf(feedPostService.remove({ actor: server(lune), postId: targets.other })),
      ).toMatchObject({ status: 403, problem: 'notAllowed' });
      // An anonymous post's author is hidden from a banned moderator.
      const { post: hidden } = await post(camille, 'Secret', { anonymous: true });
      expect((await viewOf(lune, hidden.id))!.author).toBeNull();
      expect((await viewOf(lune, hidden.id))!.canDelete).toBe(false);
      await feedPostService.remove({ actor: server(lune), postId: own.id });
    });

    it('a site ban counts while in force, and neither ban counts once over', async () => {
      const mika = await person('Mika Lefort');
      const banned = async () => (await feedRightsService.playerState(mika.uuid)).banned;
      await db.update(user).set({ banned: true, banExpires: null }).where(eq(user.id, mika.id));
      expect(await banned()).toBe(true);
      await db
        .update(user)
        .set({ banExpires: new Date(Date.now() + DAY) })
        .where(eq(user.id, mika.id));
      expect(await banned()).toBe(true);
      await db
        .update(user)
        .set({ banExpires: new Date(Date.now() - 1000) })
        .where(eq(user.id, mika.id));
      expect(await banned()).toBe(false);
      await db.update(user).set({ banned: false, banExpires: null }).where(eq(user.id, mika.id));

      await wardenBanOf(mika, new Date(Date.now() - 1000));
      expect(await banned()).toBe(false);
      await wardenBanOf(mika, null, new Date());
      expect(await banned()).toBe(false);
      expect(await problemOf(post(mika, 'Libre'))).toBeNull();
      await wardenBanOf(mika, new Date(Date.now() + DAY));
      expect(await banned()).toBe(true);
    });

    it('the badge follows the role now, on old posts too', async () => {
      const kael = await person('Kael Dubois', { role: 'feed-announcer' });
      const { post: announcement } = await post(kael, 'Annonce', { feed: 'announcements' });
      expect(announcement.author!.announcer).toBe(true);
      await feedAnnouncerService.setFromServer({ uuid: kael.uuid, announcer: false });
      expect((await viewOf(camille, announcement.id))!.author!.announcer).toBe(false);
      // A ban removes the badge too.
      const { post: global } = await post(lune, 'Global');
      await wardenBanOf(lune);
      expect((await viewOf(camille, global.id))!.author!.announcer).toBe(false);
    });

    it('an unlinked account reads as a guest, and its posts keep showing it', async () => {
      const mika = await person('Mika Lefort', { accounts: 2 });
      const { post: created } = await post(mika, 'Avant');
      await db
        .update(minecraftAccount)
        .set({ unlinkedAt: new Date() })
        .where(eq(minecraftAccount.uuid, mika.uuid));
      expect(await feedRightsService.playerState(mika.uuid)).toMatchObject({
        linked: false,
        me: null,
        rights: { write: false },
      });
      expect(await attempts(mika, targets)).toMatchObject({
        postGlobal: 'notLinked',
        like: 'notLinked',
      });
      // Its second account still writes, and still owns the post.
      const second = { uuid: mika.accounts[1]!.uuid };
      expect(await viewOf(second, created.id)).toMatchObject({
        mine: true,
        author: { uuid: mika.uuid, username: mika.username },
      });
      await feedPostService.remove({ actor: server(second), postId: created.id });
    });

    it('a moderator without a linked account moderates but does not write', async () => {
      const admin = await person('Admin Seul', { role: 'admin', accounts: 0 });
      const viewer = await feedRightsService.viewer(db, { userId: admin.id });
      expect(viewer.rights).toEqual({ write: false, announce: false, moderate: true });
      const { post: hidden } = await post(camille, 'Secret', { anonymous: true });
      const { posts } = await feedViewService.viewsOf({ userId: admin.id }, [hidden.id]);
      expect(posts[0]!.author).toMatchObject({ uuid: camille.uuid });
    });
  });

  describe('flags (docs/feed.md, Flags)', () => {
    it('feed.writing off still lets authors delete and announcers pin in the services', async () => {
      setFlags({ 'feed.writing': false });
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      expect((await feedRightsService.playerState(lune.uuid)).writing).toBe(false);
      expect((await feedRightsService.me(lune.id)).writing).toBe(false);
      setFlags({ feed: false });
      // A part reads off when its parent is.
      expect((await feedRightsService.playerState(lune.uuid)).writing).toBe(false);
      setFlags({ 'feed.serverApi': false });
      // feed.serverApi off leaves writing on for the browser.
      expect((await feedRightsService.me(lune.id)).writing).toBe(true);
    });
  });

  describe('the announcer command (4.14, 4.15)', () => {
    it('takes the console without an issuer, audited with no actor', async () => {
      const kael = await person('Kael Dubois');
      const from = await latestEvent();
      expect(
        await feedAnnouncerService.setFromServer({ uuid: kael.uuid, announcer: true }),
      ).toEqual({
        uuid: kael.uuid,
        username: kael.username,
        announcer: true,
        viaRole: false,
      });
      const [entry] = await db
        .select()
        .from(audit)
        .where(eq(audit.action, 'minecraft.feed.announcer'));
      expect(entry).toMatchObject({
        source: 'server',
        actorUserId: null,
        actorMinecraftUuid: null,
        targetUserId: kael.id,
        data: { announcer: true },
      });
      expect(await eventsSince(from)).toEqual([{ type: 'rights', data: { uuids: [kael.uuid] } }]);
      // Taking it back: one more audit row and event; taking it again changes nothing.
      await feedAnnouncerService.setFromServer({ uuid: kael.uuid, announcer: false });
      await feedAnnouncerService.setFromServer({ uuid: kael.uuid, announcer: false });
      expect(
        await db.select().from(audit).where(eq(audit.action, 'minecraft.feed.announcer')),
      ).toHaveLength(2);
      expect((await eventsSince(from)).filter((event) => event.type === 'rights')).toHaveLength(2);
    });

    it('records the in-game issuer as the actor, with the Minecraft account', async () => {
      const lune = await person('Lune Garnier', { role: 'admin' });
      const kael = await person('Kael Dubois', { accounts: 2 });
      const from = await latestEvent();
      await feedAnnouncerService.setFromServer({
        uuid: kael.accounts[1]!.uuid,
        announcer: true,
        issuer: { uuid: lune.uuid, username: lune.username },
      });
      const [entry] = await db
        .select()
        .from(audit)
        .where(eq(audit.action, 'minecraft.feed.announcer'));
      expect(entry).toMatchObject({
        source: 'server',
        actorUserId: lune.id,
        actorMinecraftUuid: lune.uuid,
        actorMinecraftName: lune.username,
        targetUserId: kael.id,
      });
      // The event names every linked account of the person, not just the one typed.
      const [event] = await eventsSince(from);
      expect([...(event!.data.uuids as string[])].sort()).toEqual(
        kael.accounts.map((account) => account.uuid).sort(),
      );
      // Their rights follow on every account.
      expect((await feedRightsService.playerState(kael.uuid)).rights.announce).toBe(true);
    });

    it('refuses a banned moderator as issuer, and a feed-announcer as issuer', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const kael = await person('Kael Dubois', { role: 'feed-announcer' });
      const mika = await person('Mika Lefort');
      await expect(
        problemOf(
          feedAnnouncerService.setFromServer({
            uuid: mika.uuid,
            announcer: true,
            issuer: { uuid: kael.uuid, username: kael.username },
          }),
        ),
      ).resolves.toMatchObject({ status: 403, problem: 'issuerNotAllowed' });
      await wardenBanOf(lune);
      await expect(
        problemOf(
          feedAnnouncerService.setFromServer({
            uuid: mika.uuid,
            announcer: true,
            issuer: { uuid: lune.uuid, username: lune.username },
          }),
        ),
      ).resolves.toMatchObject({ status: 403, problem: 'issuerNotAllowed' });
      // An issuer whose account was unlinked is refused too.
      const other = await person('Other Modo', { role: 'admin' });
      await db
        .update(minecraftAccount)
        .set({ unlinkedAt: new Date() })
        .where(eq(minecraftAccount.uuid, other.uuid));
      await expect(
        problemOf(
          feedAnnouncerService.setFromServer({
            uuid: mika.uuid,
            announcer: true,
            issuer: { uuid: other.uuid, username: other.username },
          }),
        ),
      ).resolves.toMatchObject({ status: 403, problem: 'issuerNotAllowed' });
      expect(
        await db.select().from(audit).where(eq(audit.action, 'minecraft.feed.announcer')),
      ).toEqual([]);
    });

    it('refuses a ghost target, and an admin target’s removal; gives a moderator nothing', async () => {
      const ghost = await person('Ghost Person', { ghost: true });
      const admin = await person('Admin Lune', { role: 'admin' });
      expect(
        await problemOf(feedAnnouncerService.setFromServer({ uuid: ghost.uuid, announcer: true })),
      ).toMatchObject({ status: 409, problem: 'isGhost' });
      expect(
        await problemOf(feedAnnouncerService.setFromServer({ uuid: admin.uuid, announcer: false })),
      ).toMatchObject({ status: 409, problem: 'impliedByRole' });
      const from = await latestEvent();
      expect(
        await feedAnnouncerService.setFromServer({ uuid: admin.uuid, announcer: true }),
      ).toMatchObject({ announcer: true, viaRole: true });
      const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, admin.id));
      expect(row!.role).toBe('admin');
      expect(await eventsSince(from)).toEqual([]);
      // A moderator who is banned announces through no role at all: removal is still refused.
      await wardenBanOf(admin);
      expect(
        await problemOf(feedAnnouncerService.setFromServer({ uuid: admin.uuid, announcer: false })),
      ).toMatchObject({ status: 409, problem: 'impliedByRole' });
      expect(
        await feedAnnouncerService.setFromServer({ uuid: admin.uuid, announcer: true }),
      ).toMatchObject({ announcer: false, viaRole: true });
    });

    it('keeps other roles when giving and taking the role, and lists only role holders', async () => {
      const kael = await person('Kael Dubois', { role: 'events-manager', showRealName: false });
      await person('Lune Garnier', { role: 'warden-admin,feed-announcer' });
      const nina = await person('Nina Petit', { role: 'feed-announcer', accounts: 2 });
      await feedAnnouncerService.setFromServer({ uuid: kael.uuid, announcer: true });
      const [given] = await db.select({ role: user.role }).from(user).where(eq(user.id, kael.id));
      expect(given!.role!.split(',').sort()).toEqual(['events-manager', 'feed-announcer']);
      const { items } = await feedAnnouncerService.list();
      // Moderators are not listed even with the role; names follow the Warden setting.
      expect(items).toEqual(
        expect.arrayContaining([
          { realName: null, accounts: [{ uuid: kael.uuid, username: kael.username }] },
          {
            realName: 'Nina P.',
            accounts: nina.accounts.map((account) => ({
              uuid: account.uuid,
              username: account.username,
            })),
          },
        ]),
      );
      expect(items).toHaveLength(2);
      await feedAnnouncerService.setFromServer({ uuid: kael.uuid, announcer: false });
      const [taken] = await db.select({ role: user.role }).from(user).where(eq(user.id, kael.id));
      expect(taken!.role).toBe('events-manager');
    });

    it('gives and takes the role from the admin too, refusing unknown people', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const kael = await person('Kael Dubois');
      expect(
        await feedAnnouncerService.setFromAdmin({
          actorId: lune.id,
          userId: kael.id,
          announcer: true,
        }),
      ).toEqual({ userId: kael.id, announcer: true, viaRole: false });
      expect(await feedAnnouncerService.get(lune.id)).toEqual({
        userId: lune.id,
        announcer: true,
        viaRole: true,
      });
      expect(
        await problemOf(
          feedAnnouncerService.setFromAdmin({
            actorId: lune.id,
            userId: 'nobody',
            announcer: true,
          }),
        ),
      ).toMatchObject({ status: 404, problem: 'notFound' });
      expect(await problemOf(feedAnnouncerService.get('nobody'))).toMatchObject({
        status: 404,
        problem: 'notFound',
      });
      const [entry] = await db
        .select()
        .from(audit)
        .where(eq(audit.action, 'minecraft.feed.announcer'));
      expect(entry).toMatchObject({ actorUserId: lune.id, targetUserId: kael.id });
    });
  });

  describe('rights events from outside Feed (docs/feed.md, "Account deletion, unlink and ban")', () => {
    const rightsSince = async (from: number) =>
      (await eventsSince(from))
        .filter((event) => event.type === 'rights')
        .map((event) => [...(event.data.uuids as string[])].sort());

    it('sends one when a ban is lifted by ID, and when the Warden admin role changes', async () => {
      const admin = await person('Admin Lune', { role: 'admin' });
      const camille = await person('Camille Roux', { accounts: 2 });
      const accounts = camille.accounts.map((account) => account.uuid).sort();
      const web = { source: 'web' as const, userId: admin.id };
      const ban = await wardenModerationService.ban({
        userId: camille.id,
        body: { reason: 'Spam', durationSeconds: 3600 },
        actor: web,
      });
      let from = await latestEvent();
      await wardenModerationService.revokeById({ banId: ban.id, actor: web });
      expect(await rightsSince(from)).toEqual([accounts]);

      from = await latestEvent();
      await wardenAdminService.setWardenAdmin({ userId: camille.id, on: true, actor: web });
      await wardenAdminService.setWardenAdmin({ userId: camille.id, on: false, actor: web });
      expect(await rightsSince(from)).toEqual([accounts, accounts]);

      from = await latestEvent();
      await feedAnnouncerService.setFromAdmin({
        actorId: admin.id,
        userId: camille.id,
        announcer: true,
      });
      await feedAnnouncerService.setFromAdmin({
        actorId: admin.id,
        userId: camille.id,
        announcer: true,
      });
      expect(await rightsSince(from)).toEqual([accounts]);
    });

    it('sends none for a person with no linked Minecraft account', async () => {
      const admin = await person('Admin Lune', { role: 'admin' });
      const unlinked = await person('Sans Compte', { accounts: 0 });
      const from = await latestEvent();
      await feedAnnouncerService.setFromAdmin({
        actorId: admin.id,
        userId: unlinked.id,
        announcer: true,
      });
      expect(await rightsSince(from)).toEqual([]);
    });

    // Accepting an appeal lifts the ban through the moderation service's own revoke, not unban,
    // so no rights event goes out (the contract lists an unban among what sends one). A banned
    // player can't be on the server, so the mod reads the state again at their next join; the
    // gap is the contract's, not one a player sees.
    it.fails('sends one when an accepted appeal lifts the ban', async () => {
      const admin = await person('Admin Lune', { role: 'admin' });
      const camille = await person('Camille Roux');
      const web = { source: 'web' as const, userId: admin.id };
      const ban = await wardenModerationService.ban({
        userId: camille.id,
        body: { reason: 'Spam', durationSeconds: 3600 },
        actor: web,
      });
      const appeal = await wardenModerationService.appeal({
        actorId: camille.id,
        banId: ban.id,
        body: 'Pardon',
      });
      const from = await latestEvent();
      await wardenModerationService.decideAppeal({
        actorId: admin.id,
        appealId: appeal.id,
        accept: true,
        response: 'Accordé',
      });
      expect((await feedRightsService.playerState(camille.uuid)).banned).toBe(false);
      expect(await rightsSince(from)).toEqual([[camille.uuid]]);
    });
  });

  describe('read state of an unlinked or guest reader', () => {
    it('stores nothing for a guest', async () => {
      const guest = randomUUID();
      await feedReadStateService.markFeedSeen({ player: guest }, 'global', new Date());
      expect(await db.select().from(feedMember)).toEqual([]);
    });
  });
});
