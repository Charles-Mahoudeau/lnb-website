import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { createError } from 'nuxt/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import getAnnouncer from '~~/server/api/feed/admin/announcers/[userId].get';
import putAnnouncer from '~~/server/api/feed/admin/announcers/[userId].put';
import deleteRow from '~~/server/api/feed/admin/posts/[id]/delete.post';
import getRow from '~~/server/api/feed/admin/posts/[id].get';
import listRows from '~~/server/api/feed/admin/posts/index.get';
import { db } from '~~/server/db';
import { audit, feedPost, user, wardenBan } from '~~/server/db/schema';
import { feedLimits } from '~~/server/services/feed/shared';

import { api, plain, problem, refusal, requireTestUser } from './feed-browser-helpers';
import type { As } from './feed-browser-helpers';
import {
  call,
  eventsSince,
  latestEvent,
  person,
  post,
  reply,
  setFlags,
  stubServerUtils,
  wipe,
} from './feed-helpers';
import type { HttpAnswer } from './feed-helpers';

import type { FeedAdminDetail, FeedAdminList } from '#shared/schemas/feed';
import type { AuditAction } from '#shared/utils/audit-actions';
import { isWardenAdmin } from '#shared/utils/roles';

// The admin's Feed routes at the HTTP level (docs/feed.md, "For the admin"): each handler called
// as Nitro calls it, signed in as a test person, for the guards, the problems, the plain 400s and
// 404s, the audit entries and the flags they ignore.

const BASE = '/api/feed/admin';
const SIGNED_IN = 'x-test-user';

/** `requireWardenAdmin` on the test session: 401 signed out, 403 without a moderator role. */
async function requireTestWardenAdmin(event: { req: Request }) {
  const row = await requireTestUser(event);
  if (!isWardenAdmin(row.role)) throw createError({ status: 403, statusText: 'Forbidden' });
  return row;
}

function send(
  handler: Parameters<typeof call>[0],
  as: As,
  request: Omit<Parameters<typeof call>[1], 'auth' | 'headers'>,
) {
  return call(handler, { ...request, auth: null, headers: as ? { [SIGNED_IN]: as.id } : {} });
}

const admin = {
  list: (as: As, query = '') =>
    send(listRows, as, { method: 'GET', url: `${BASE}/posts?${query}` }),
  row: (as: As, id: string) =>
    send(getRow, as, { method: 'GET', url: `${BASE}/posts/${id}`, params: { id } }),
  remove: (as: As, id: string, body?: unknown) =>
    send(deleteRow, as, {
      method: 'POST',
      url: `${BASE}/posts/${id}/delete`,
      params: { id },
      body,
    }),
  announcer: (as: As, userId: string) =>
    send(getAnnouncer, as, {
      method: 'GET',
      url: `${BASE}/announcers/${userId}`,
      params: { userId },
    }),
  setAnnouncer: (as: As, userId: string, body: unknown) =>
    send(putAnnouncer, as, {
      method: 'PUT',
      url: `${BASE}/announcers/${userId}`,
      params: { userId },
      body,
    }),
};

const list = (answer: HttpAnswer) => answer.body as FeedAdminList;
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

const auditOf = (action: AuditAction) =>
  db.select().from(audit).where(eq(audit.action, action)).orderBy(audit.id);

describe('Feed admin routes', () => {
  beforeAll(() => {
    stubServerUtils();
    vi.stubGlobal('requireUser', requireTestUser);
    vi.stubGlobal('requireWardenAdmin', requireTestWardenAdmin);
  });
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Every route once, with a valid request, for the given caller. */
  async function everyRoute(as: As, ids: { post: string; target: string }) {
    return [
      await admin.list(as),
      await admin.row(as, ids.post),
      await admin.announcer(as, ids.target),
      await admin.setAnnouncer(as, ids.target, { announcer: false }),
      await admin.remove(as, ids.post, { reason: 'Hors sujet' }),
    ];
  }

  describe('who may call them', () => {
    it('refuses a signed-out person, a player, an events manager and an economy admin', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille, 'Bonjour');
      const ids = { post: main.id, target: camille.id };
      for (const answer of await everyRoute(null, ids)) expect(refusal(answer)).toEqual(plain(401));
      for (const role of [null, 'events-manager', 'economy-admin', 'feed-announcer']) {
        const caller = await person(`Rôle ${String(role)}`, { role: role ?? undefined });
        for (const answer of await everyRoute(caller, ids)) {
          expect(refusal(answer), String(role)).toEqual(plain(403));
        }
      }
      // Nothing was deleted on the way.
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, main.id));
      expect(row!.deletedAt).toBeNull();
    });

    it('lets a Warden admin and a site admin in, whatever the Feed flags', async () => {
      const camille = await person('Camille Roux');
      for (const role of ['warden-admin', 'admin']) {
        const moderator = await person(`Modo ${role}`, { role });
        const { post: main } = await post(camille, `Pour ${role}`);
        setFlags({ feed: false, 'feed.writing': false, 'feed.serverApi': false });
        const answers = await everyRoute(moderator, { post: main.id, target: camille.id });
        expect(
          answers.map((answer) => answer.status),
          role,
        ).toEqual([200, 200, 200, 200, 204]);
        setFlags();
      }
    });
  });

  describe('GET /posts', () => {
    it('lists live and deleted rows with their authors, anonymous ones too', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: secret } = await post(camille, 'Secret', { anonymous: true });
      const { post: gone } = await post(camille, 'Parti');
      await admin.remove(lune, gone.id, { reason: 'Spam' });
      const answer = await admin.list(lune);
      expect(answer.status).toBe(200);
      const byId = new Map(list(answer).items.map((item) => [item.id, item]));
      expect(byId.get(secret.id)).toMatchObject({
        anonymous: true,
        author: { uuid: camille.uuid, username: camille.username },
        authorUserId: camille.id,
      });
      expect(byId.get(gone.id)).toMatchObject({
        deletedCause: 'moderator',
        deletedReason: 'Spam',
        deletedBy: { userId: lune.id, name: 'Lune Garnier' },
      });
      expect(list(answer).summary).toEqual({ last30Days: 2, deleted: 1 });
    });

    it('reads every filter from the query string', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: announcement } = await post(lune, 'Annonce du soir', {
        feed: 'announcements',
      });
      const { post: global } = await post(camille, 'Global du jour', { anonymous: true });
      const { post: answer } = await reply(camille, announcement.id);
      await admin.remove(lune, global.id);
      const ids = async (query: string) =>
        list(await admin.list(lune, query))
          .items.map((item) => item.id)
          .sort();
      expect(await ids('feeds=announcements')).toEqual([announcement.id, answer.id].sort());
      expect(await ids('feeds=global')).toEqual([global.id]);
      expect(await ids('feeds=announcements,global')).toHaveLength(3);
      expect(await ids('replies=true')).toEqual([answer.id]);
      expect(await ids('anonymous=true')).toEqual([global.id]);
      expect(await ids('deleted=true')).toEqual([global.id]);
      expect(await ids(`user=${camille.id}`)).toEqual([global.id, answer.id].sort());
      expect(await ids('q=du+soir')).toEqual([announcement.id]);
      expect(await ids(`q=${encodeURIComponent('  camille  ')}`)).toEqual(
        [global.id, answer.id].sort(),
      );
      expect(await ids('feeds=global&deleted=true&anonymous=true')).toEqual([global.id]);
    });

    it('answers a plain 400 for a bad filter or a forged cursor', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      for (const query of [
        'q=a',
        'q=+a+',
        `q=${'x'.repeat(101)}`,
        'feeds=nope',
        'feeds=global,nope',
        'feeds=,',
        'replies=yes',
        'anonymous=1',
        'deleted=false',
        'user=',
        'cursor=',
        `cursor=${'A'.repeat(129)}`,
        'cursor=nope',
        `cursor=${b64([Date.parse('+010000-01-01T00:00:00.000Z'), randomUUID()])}`,
        `cursor=${b64([8.64e15, randomUUID()])}`,
        `cursor=${b64([-1, randomUUID()])}`,
        `cursor=${b64([0, 'not-a-uuid'])}`,
      ]) {
        expect(refusal(await admin.list(lune, query)), query).toEqual(plain(400));
      }
    });

    it('pages with nextCursor, and takes a well-formed cursor up to the year 9999', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      for (let i = 0; i < 51; i++) await post(camille, `P${String(i)}`);
      const first = list(await admin.list(lune));
      expect(first.items).toHaveLength(50);
      const second = list(await admin.list(lune, `cursor=${first.nextCursor!}`));
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      const late = b64([Date.parse('9999-12-31T23:59:59.999Z'), randomUUID()]);
      expect(list(await admin.list(lune, `cursor=${late}`)).items).toHaveLength(50);
    });
  });

  describe('GET /posts/:id', () => {
    it('answers the row and its whole thread, deleted replies included', async () => {
      const lune = await person('Lune Garnier', { role: 'admin' });
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille, 'Fil');
      const { post: first } = await reply(camille, main.id, null, { anonymous: true });
      const { post: second } = await reply(camille, main.id, first.id);
      await admin.remove(lune, first.id);
      const answer = await admin.row(lune, second.id);
      expect(answer.status).toBe(200);
      const detail = answer.body as FeedAdminDetail;
      expect(detail.post.id).toBe(second.id);
      expect(detail.thread.post.id).toBe(main.id);
      expect(detail.thread.replies.map((row) => [row.id, row.deletedAt !== null])).toEqual([
        [first.id, true],
        [second.id, false],
      ]);
      // A main post opens itself as the row.
      expect((await admin.row(lune, main.id)).body).toMatchObject({
        post: { id: main.id },
        thread: { post: { id: main.id } },
      });
    });

    it('answers notFound for an unknown post, and a plain 404 for an ID that is no UUID', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      expect(refusal(await admin.row(lune, randomUUID()))).toEqual(problem(404, 'notFound'));
      for (const id of ['nope', '123', `${randomUUID()}x`]) {
        expect(refusal(await admin.row(lune, id)), id).toEqual(plain(404));
      }
    });
  });

  describe('POST /posts/:id/delete', () => {
    it('deletes with a reason, audits it, and the post leaves the Feed page', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille, 'Hors sujet', { anonymous: true });
      const { post: answer } = await reply(camille, main.id);
      expect((await api.page(camille, 'feed=global')).body).toMatchObject({
        posts: [{ id: main.id }],
      });
      const from = await latestEvent();
      const answered = await admin.remove(lune, main.id, { reason: '  Spam répété  ' });
      expect(answered.status).toBe(204);
      expect(answered.body).toBeNull();

      const rows = await db.select().from(feedPost).where(eq(feedPost.threadId, main.id));
      expect(rows.map((row) => row.deletedCause)).toEqual(['thread']);
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, main.id));
      expect(row).toMatchObject({
        deletedCause: 'moderator',
        deletedByUserId: lune.id,
        deletedReason: 'Spam répété',
      });
      const [entry, ...more] = await auditOf('minecraft.feed.delete');
      expect(more).toEqual([]);
      expect(entry).toMatchObject({
        actorUserId: lune.id,
        targetUserId: camille.id,
        data: {
          postId: main.id,
          threadId: null,
          feed: 'global',
          reply: false,
          anonymous: true,
          reason: 'Spam répété',
        },
      });
      expect((await eventsSince(from)).map((event) => event.type)).toContain('deleted');
      expect((await api.page(camille, 'feed=global')).body).toMatchObject({ posts: [] });
      expect(refusal(await api.thread(camille, main.id))).toEqual(problem(404, 'notFound'));
      expect(refusal(await api.thread(camille, answer.id))).toEqual(problem(404, 'notFound'));
    });

    it('takes no body, an empty body or an empty reason as no reason', async () => {
      const lune = await person('Lune Garnier', { role: 'admin' });
      const camille = await person('Camille Roux');
      for (const body of [undefined, {}, { reason: '' }, { reason: '   ' }]) {
        const { post: target } = await post(camille, `Cible ${JSON.stringify(body)}`);
        expect((await admin.remove(lune, target.id, body)).status, JSON.stringify(body)).toBe(204);
        const [row] = await db.select().from(feedPost).where(eq(feedPost.id, target.id));
        expect(row!.deletedReason, JSON.stringify(body)).toBeNull();
      }
      const entries = await auditOf('minecraft.feed.delete');
      expect(entries).toHaveLength(4);
      expect(entries.map((entry) => (entry.data as { reason: unknown }).reason)).toEqual([
        null,
        null,
        null,
        null,
      ]);
    });

    it('answers a plain 400 for a reason past 500 characters or a malformed body', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: target } = await post(camille);
      for (const body of [{ reason: 'x'.repeat(501) }, { reason: 42 }, '{', '[]', 'null']) {
        expect(refusal(await admin.remove(lune, target.id, body)), JSON.stringify(body)).toEqual(
          plain(400),
        );
      }
      expect((await admin.remove(lune, target.id, { reason: 'x'.repeat(500) })).status).toBe(204);
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, target.id));
      expect(row!.deletedReason).toHaveLength(500);
    });

    it('answers 204 again for a deleted post, without a second audit entry', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: target } = await post(camille);
      expect((await admin.remove(lune, target.id, { reason: 'Un' })).status).toBe(204);
      expect((await admin.remove(lune, target.id, { reason: 'Deux' })).status).toBe(204);
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, target.id));
      expect(row!.deletedReason).toBe('Un');
      expect(await auditOf('minecraft.feed.delete')).toHaveLength(1);
    });

    it('deletes a moderator’s own post as its author: no reason kept, nothing audited', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const { post: own } = await post(lune, 'À moi');
      expect((await admin.remove(lune, own.id, { reason: 'Moi' })).status).toBe(204);
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, own.id));
      expect(row).toMatchObject({ deletedCause: 'author', deletedReason: null });
      expect(await auditOf('minecraft.feed.delete')).toEqual([]);
    });

    it('deletes a reply alone, and audits it as a reply', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const { post: answer } = await reply(camille, main.id);
      expect((await admin.remove(lune, answer.id)).status).toBe(204);
      const [kept] = await db.select().from(feedPost).where(eq(feedPost.id, main.id));
      expect(kept).toMatchObject({ deletedAt: null, replyCount: 0 });
      const [entry] = await auditOf('minecraft.feed.delete');
      expect(entry!.data).toMatchObject({ postId: answer.id, threadId: main.id, reply: true });
    });

    it('answers notFound for an unknown post, a plain 404 for no UUID', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      expect(refusal(await admin.remove(lune, randomUUID()))).toEqual(problem(404, 'notFound'));
      expect(refusal(await admin.remove(lune, 'nope'))).toEqual(plain(404));
    });

    it('refuses a moderator under a Warden ban with notAllowed', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      const { post: target } = await post(camille);
      await db.insert(wardenBan).values({ userId: lune.id, reason: 'Test', source: 'web' });
      expect(refusal(await admin.remove(lune, target.id))).toEqual(problem(403, 'notAllowed'));
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, target.id));
      expect(row!.deletedAt).toBeNull();
    });
  });

  describe('the announcer role', () => {
    it('gives and takes it, auditing each real change only', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      expect((await admin.announcer(lune, camille.id)).body).toEqual({
        userId: camille.id,
        announcer: false,
        viaRole: false,
      });
      const from = await latestEvent();
      for (const announcer of [true, true, false, false]) {
        const answer = await admin.setAnnouncer(lune, camille.id, { announcer });
        expect(answer.status).toBe(200);
        expect(answer.body).toEqual({ userId: camille.id, announcer, viaRole: false });
      }
      const entries = await auditOf('minecraft.feed.announcer');
      expect(entries.map((entry) => entry.data)).toEqual([
        { announcer: true },
        { announcer: false },
      ]);
      expect(entries[0]).toMatchObject({ actorUserId: lune.id, targetUserId: camille.id });
      const rights = (await eventsSince(from)).filter((event) => event.type === 'rights');
      expect(rights).toHaveLength(2);
      const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, camille.id));
      expect(row!.role).toBeNull();
    });

    it('keeps the other roles of the person', async () => {
      const lune = await person('Lune Garnier', { role: 'admin' });
      const kael = await person('Kael Dubois', { role: 'events-manager' });
      await admin.setAnnouncer(lune, kael.id, { announcer: true });
      const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, kael.id));
      expect(row!.role).toBe('events-manager,feed-announcer');
    });

    it('says a moderator announces by role, and refuses to take it from them', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const site = await person('Site Admin', { role: 'admin' });
      for (const moderator of [lune, site]) {
        expect((await admin.announcer(lune, moderator.id)).body).toEqual({
          userId: moderator.id,
          announcer: true,
          viaRole: true,
        });
        expect((await admin.setAnnouncer(lune, moderator.id, { announcer: true })).body).toEqual({
          userId: moderator.id,
          announcer: true,
          viaRole: true,
        });
        expect(refusal(await admin.setAnnouncer(lune, moderator.id, { announcer: false }))).toEqual(
          problem(409, 'impliedByRole'),
        );
      }
      expect(await auditOf('minecraft.feed.announcer')).toEqual([]);
    });

    it('refuses a ghost account with isGhost, and an unknown one with notFound', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const ghost = await person('Fantôme', { ghost: true, accounts: 0 });
      expect((await admin.announcer(lune, ghost.id)).body).toEqual({
        userId: ghost.id,
        announcer: false,
        viaRole: false,
      });
      expect(refusal(await admin.setAnnouncer(lune, ghost.id, { announcer: true }))).toEqual(
        problem(409, 'isGhost'),
      );
      expect(refusal(await admin.announcer(lune, 'nobody'))).toEqual(problem(404, 'notFound'));
      expect(refusal(await admin.setAnnouncer(lune, 'nobody', { announcer: true }))).toEqual(
        problem(404, 'notFound'),
      );
      expect(refusal(await admin.announcer(lune, 'x'.repeat(65)))).toEqual(plain(404));
    });

    it('shows the role of a person who cannot use it now, so the switch can take it back', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const unlinked = await person('Sans Compte', { role: 'feed-announcer', accounts: 0 });
      const bannedOne = await person('Banni', { role: 'feed-announcer' });
      await db.insert(wardenBan).values({ userId: bannedOne.id, reason: 'Test', source: 'web' });
      for (const target of [unlinked, bannedOne]) {
        expect((await admin.announcer(lune, target.id)).body).toMatchObject({ announcer: true });
        expect((await admin.setAnnouncer(lune, target.id, { announcer: false })).body).toEqual({
          userId: target.id,
          announcer: false,
          viaRole: false,
        });
      }
    });

    it('answers a plain 400 for a body without a boolean', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const camille = await person('Camille Roux');
      for (const body of [undefined, {}, { announcer: 'true' }, { announcer: 1 }, '{']) {
        expect(
          refusal(await admin.setAnnouncer(lune, camille.id, body)),
          JSON.stringify(body),
        ).toEqual(plain(400));
      }
      const rows = await db
        .select()
        .from(audit)
        .where(
          and(eq(audit.action, 'minecraft.feed.announcer'), eq(audit.targetUserId, camille.id)),
        );
      expect(rows).toEqual([]);
    });
  });
});
