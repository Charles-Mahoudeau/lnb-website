import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import putAnnouncer from '~~/server/api/feed/server/announcers/[uuid].put';
import listAnnouncers from '~~/server/api/feed/server/announcers/index.get';
import events from '~~/server/api/feed/server/events.get';
import ackNotifications from '~~/server/api/feed/server/notifications/ack.post';
import listNotifications from '~~/server/api/feed/server/notifications/index.get';
import players from '~~/server/api/feed/server/players/[uuid].get';
import unlike from '~~/server/api/feed/server/posts/[id]/like.delete';
import like from '~~/server/api/feed/server/posts/[id]/like.put';
import unpin from '~~/server/api/feed/server/posts/[id]/pin.delete';
import pin from '~~/server/api/feed/server/posts/[id]/pin.put';
import createReply from '~~/server/api/feed/server/posts/[id]/replies.post';
import threadSeen from '~~/server/api/feed/server/posts/[id]/seen.post';
import deletePost from '~~/server/api/feed/server/posts/[id].delete';
import getThread from '~~/server/api/feed/server/posts/[id].get';
import getPage from '~~/server/api/feed/server/posts/index.get';
import createPost from '~~/server/api/feed/server/posts/index.post';
import feedSeen from '~~/server/api/feed/server/seen.post';
import views from '~~/server/api/feed/server/views.post';
import { db } from '~~/server/db';
import { feedMember, feedNotification, feedPost, wardenBan } from '~~/server/db/schema';
import { encodeCursor } from '~~/server/services/feed/rules';
import { feedLimits } from '~~/server/services/feed/shared';

import { call, person, post, reply, setFlags, stubServerUtils, wipe } from './feed-helpers';
import type { HttpAnswer, Person } from './feed-helpers';

// The Minecraft server's Feed routes at the HTTP level (docs/feed-mod.md, sections 2, 4, 5 and
// 13): each handler is called as Nitro calls it, so the statuses, `data.problem`, `data.flag` and
// `Retry-After` the mod reads are the ones checked, not the services' return values.

const BASE = '/api/feed/server';
const cp = (...codes: number[]) => String.fromCodePoint(...codes);

function postBody(player: Person | { uuid: string }, overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    player: player.uuid,
    feed: 'global',
    text: 'Salut',
    anonymous: false,
    ...overrides,
  };
}

function replyBody(player: Person | { uuid: string }, overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    player: player.uuid,
    replyTo: null,
    text: 'Moi !',
    anonymous: false,
    ...overrides,
  };
}

const api = {
  post: (body: unknown) => call(createPost, { method: 'POST', url: `${BASE}/posts`, body }),
  reply: (id: string, body: unknown) =>
    call(createReply, {
      method: 'POST',
      url: `${BASE}/posts/${id}/replies`,
      params: { id },
      body,
    }),
  like: (id: string, player: string) =>
    call(like, {
      method: 'PUT',
      url: `${BASE}/posts/${id}/like`,
      params: { id },
      body: { player },
    }),
  unlike: (id: string, player: string) =>
    call(unlike, {
      method: 'DELETE',
      url: `${BASE}/posts/${id}/like?player=${player}`,
      params: { id },
    }),
  pin: (id: string, player: string, replace?: boolean) =>
    call(pin, {
      method: 'PUT',
      url: `${BASE}/posts/${id}/pin`,
      params: { id },
      body: replace === undefined ? { player } : { player, replace },
    }),
  unpin: (id: string, player: string) =>
    call(unpin, {
      method: 'DELETE',
      url: `${BASE}/posts/${id}/pin?player=${player}`,
      params: { id },
    }),
  remove: (id: string, player: string) =>
    call(deletePost, {
      method: 'DELETE',
      url: `${BASE}/posts/${id}?player=${player}`,
      params: { id },
    }),
  page: (query: string) => call(getPage, { method: 'GET', url: `${BASE}/posts?${query}` }),
  thread: (id: string, query: string) =>
    call(getThread, { method: 'GET', url: `${BASE}/posts/${id}?${query}`, params: { id } }),
  views: (body: unknown) => call(views, { method: 'POST', url: `${BASE}/views`, body }),
  seen: (body: unknown) => call(feedSeen, { method: 'POST', url: `${BASE}/seen`, body }),
  threadSeen: (id: string, player: string) =>
    call(threadSeen, {
      method: 'POST',
      url: `${BASE}/posts/${id}/seen`,
      params: { id },
      body: { player },
    }),
  player: (uuid: string) =>
    call(players, { method: 'GET', url: `${BASE}/players/${uuid}`, params: { uuid } }),
  notifications: () => call(listNotifications, { method: 'GET', url: `${BASE}/notifications` }),
  ack: (body: unknown) =>
    call(ackNotifications, { method: 'POST', url: `${BASE}/notifications/ack`, body }),
  announcer: (uuid: string, body: unknown) =>
    call(putAnnouncer, {
      method: 'PUT',
      url: `${BASE}/announcers/${uuid}`,
      params: { uuid },
      body,
    }),
  announcers: () => call(listAnnouncers, { method: 'GET', url: `${BASE}/announcers` }),
};

/** A refusal as the mod reads it: the status, and `data` (absent on a plain refusal). */
function refusal(answer: HttpAnswer) {
  return { status: answer.status, data: answer.error?.data };
}

function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
  return { status, data: { problem: code, ...extra } };
}

/** Every route with a request that would otherwise be accepted. */
function everyRoute(ids: { post: string; player: string }) {
  const { post: id, player } = ids;
  return {
    'GET /players/:uuid': () => api.player(player),
    'GET /posts': () => api.page(`feed=global&viewer=${player}`),
    'GET /posts/:id': () => api.thread(id, `viewer=${player}`),
    'POST /views': () => api.views({ viewers: [player], ids: [id] }),
    'POST /posts': () => api.post({ ...postBody({ uuid: player }) }),
    'POST /posts/:id/replies': () => api.reply(id, replyBody({ uuid: player })),
    'PUT /posts/:id/like': () => api.like(id, player),
    'DELETE /posts/:id/like': () => api.unlike(id, player),
    'PUT /posts/:id/pin': () => api.pin(id, player),
    'DELETE /posts/:id/pin': () => api.unpin(id, player),
    'DELETE /posts/:id': () => api.remove(id, player),
    'POST /seen': () => api.seen({ player, feed: 'global', upTo: '2026-11-23T20:14:05.000Z' }),
    'POST /posts/:id/seen': () => api.threadSeen(id, player),
    'GET /notifications': () => api.notifications(),
    'POST /notifications/ack': () => api.ack({ ids: [randomUUID()] }),
    'PUT /announcers/:uuid': () => api.announcer(player, { announcer: true }),
    'GET /announcers': () => api.announcers(),
    'GET /events': () => call(events, { method: 'GET', url: `${BASE}/events` }),
  };
}

describe('Feed server routes over HTTP', () => {
  let limits: MockInstance<typeof feedLimits.check>;

  beforeAll(() => {
    stubServerUtils();
  });
  beforeEach(async () => {
    await wipe();
    setFlags();
    limits = vi.spyOn(feedLimits, 'check').mockResolvedValue();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('the secret and the flags (2.1, 2.3, 11.2)', () => {
    it('refuses every route with a plain 401 without the secret, or with a wrong one', async () => {
      const routes = everyRoute({ post: randomUUID(), player: randomUUID() });
      expect(Object.keys(routes)).toHaveLength(18);
      for (const [name, send] of Object.entries(routes)) {
        for (const auth of [null, 'Bearer wrong', `Basic ${'x'.repeat(40)}`, 'Bearer ']) {
          const answer = await callWithAuth(send, auth);
          expect(refusal(answer), `${name} with ${String(auth)}`).toEqual({
            status: 401,
            data: undefined,
          });
        }
      }
    });

    it('checks the secret before the flags', async () => {
      setFlags({ feed: false });
      const answer = await callWithAuth(() => api.notifications(), null);
      expect(answer.status).toBe(401);
    });

    it('answers 503 disabled on every route while feed or feed.serverApi is off', async () => {
      const routes = everyRoute({ post: randomUUID(), player: randomUUID() });
      for (const flag of ['feed', 'feed.serverApi'] as const) {
        setFlags({ [flag]: false });
        for (const [name, send] of Object.entries(routes)) {
          const answer = await send();
          expect(refusal(answer), `${name} with ${flag} off`).toEqual(
            problem(503, 'disabled', { flag }),
          );
          expect(answer.error?.statusMessage).toBe('disabled');
        }
      }
    });

    it('with feed.writing off, refuses posting, replying and liking, and nothing else', async () => {
      const camille = await person('Camille Roux');
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const { post: main } = await post(camille, 'Fil');
      const { post: announcement } = await post(lune, 'Annonce', { feed: 'announcements' });
      setFlags({ 'feed.writing': false });

      const off = problem(503, 'disabled', { flag: 'feed.writing' });
      expect(refusal(await api.post(postBody(camille)))).toEqual(off);
      expect(refusal(await api.reply(main.id, replyBody(camille)))).toEqual(off);
      expect(refusal(await api.like(main.id, camille.uuid))).toEqual(off);
      expect(refusal(await api.unlike(main.id, camille.uuid))).toEqual(off);

      // Reading, marking, pinning, deleting and the queue still work.
      expect((await api.player(camille.uuid)).body).toMatchObject({
        writing: false,
        rights: { write: true },
      });
      expect((await api.page(`feed=global&viewer=${camille.uuid}`)).status).toBe(200);
      expect((await api.thread(main.id, `viewer=${camille.uuid}`)).status).toBe(200);
      expect((await api.views({ viewers: [camille.uuid], ids: [main.id] })).status).toBe(200);
      expect((await api.threadSeen(main.id, camille.uuid)).status).toBe(204);
      expect(
        (await api.seen({ player: camille.uuid, feed: 'global', upTo: main.createdAt })).status,
      ).toBe(204);
      expect((await api.pin(announcement.id, lune.uuid)).status).toBe(200);
      expect((await api.unpin(announcement.id, lune.uuid)).status).toBe(200);
      expect((await api.notifications()).status).toBe(200);
      expect((await api.ack({ ids: [randomUUID()] })).status).toBe(204);
      expect((await api.announcers()).status).toBe(200);
      expect((await api.remove(main.id, camille.uuid)).status).toBe(204);
    });

    it('reads writing: false only while feed.writing is off', async () => {
      const camille = await person('Camille Roux');
      expect((await api.player(camille.uuid)).body).toMatchObject({ writing: true });
      setFlags({ 'feed.writing': false });
      expect((await api.player(camille.uuid)).body).toMatchObject({ writing: false });
    });
  });

  describe('statuses and shapes (section 4)', () => {
    it('answers 201 to a post and a reply, 204 with no body to deletes and marks', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const created = await api.post(postBody(camille));
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ replayed: false, post: { feed: 'global', mine: true } });
      const id = (created.body as { post: { id: string; createdAt: string } }).post.id;
      const createdAt = (created.body as { post: { createdAt: string } }).post.createdAt;
      expect(createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);

      const answered = await api.reply(id, replyBody(mika));
      expect(answered.status).toBe(201);
      expect(answered.body).toMatchObject({ replayed: false, post: { threadId: id } });

      for (const answer of [
        await api.threadSeen(id, camille.uuid),
        await api.seen({ player: camille.uuid, feed: 'global', upTo: createdAt }),
        await api.ack({ ids: [randomUUID()] }),
        await api.remove(id, camille.uuid),
        // Deleting again: still 204 for the author.
        await api.remove(id, camille.uuid),
      ]) {
        expect(answer.status).toBe(204);
        expect(answer.body).toBeNull();
      }
    });

    it('answers like and unlike with the state after the call (4.7)', async () => {
      const camille = await person('Camille Roux');
      const { post: created } = await post(camille);
      expect(await api.like(created.id, camille.uuid)).toMatchObject({
        status: 200,
        body: { id: created.id, likes: 1, liked: true },
      });
      expect((await api.like(created.id, camille.uuid)).body).toEqual({
        id: created.id,
        likes: 1,
        liked: true,
      });
      expect((await api.unlike(created.id, camille.uuid)).body).toEqual({
        id: created.id,
        likes: 0,
        liked: false,
      });
      expect((await api.unlike(created.id, camille.uuid)).body).toEqual({
        id: created.id,
        likes: 0,
        liked: false,
      });
    });

    it('pages with the default and largest limits, and refuses others (4.2, 4.3, 7)', async () => {
      const mika = await person('Mika Lefort');
      for (let i = 0; i < 52; i++) await post(mika, `P${String(i)}`);
      const { post: main } = await post(mika, 'Fil');
      for (let i = 0; i < 51; i++) await reply(mika, main.id);

      const page = (query: string) => api.page(`feed=global&viewer=${mika.uuid}${query}`);
      const count = (answer: HttpAnswer, key: 'posts' | 'replies') =>
        (answer.body as Record<string, unknown[]>)[key]!.length;
      expect(count(await page(''), 'posts')).toBe(20);
      expect(count(await page('&limit=50'), 'posts')).toBe(50);
      expect(count(await page('&limit=1'), 'posts')).toBe(1);
      for (const limit of ['0', '51', '-1', '2.5', 'abc', '']) {
        expect(refusal(await page(`&limit=${limit}`)), `limit=${limit}`).toEqual({
          status: 400,
          data: undefined,
        });
      }

      const thread = (query: string) => api.thread(main.id, `viewer=${mika.uuid}${query}`);
      const first = await thread('');
      expect(count(first, 'replies')).toBe(50);
      const next = (first.body as { next: string }).next;
      expect(count(await thread(`&after=${next}`), 'replies')).toBe(1);
      expect(refusal(await thread('&limit=51'))).toEqual({ status: 400, data: undefined });
    });
  });

  describe('malformed requests: plain 400 and 404 (2.3)', () => {
    it('refuses bodies that are not JSON or not the schema with a plain 400', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const bad = [
        () => api.post('{'),
        () => api.post('null'),
        () => api.post(''),
        () => api.post([]),
        () => api.post({ ...postBody(camille), idempotencyKey: 'k' }),
        () => api.post({ ...postBody(camille), player: 'Camille' }),
        () => api.post({ ...postBody(camille), feed: 'news' }),
        () => api.post({ ...postBody(camille), anonymous: 'yes' }),
        () => api.post({ ...postBody(camille), text: 42 }),
        () => api.post({ ...postBody(camille), text: 'a'.repeat(4001) }),
        // The raw cap counts code points, as Zod 4 measures strings.
        () => api.post({ ...postBody(camille), text: cp(0x1f600).repeat(4001) }),
        () => api.reply(main.id, { ...replyBody(camille), replyTo: 'nope' }),
        () => api.reply(main.id, { ...replyBody(camille), replyTo: undefined }),
        () => api.like(main.id, 'not-a-uuid'),
        () => api.pin(main.id, camille.uuid, 'yes' as unknown as boolean),
        () => api.views({ viewers: [], ids: [main.id] }),
        () =>
          api.views({
            viewers: Array.from({ length: 201 }, () => randomUUID()),
            ids: [main.id],
          }),
        () => api.views({ viewers: [camille.uuid], ids: ['nope'] }),
        () =>
          api.views({
            viewers: [camille.uuid.toUpperCase(), camille.uuid],
            ids: [main.id],
          }),
        () => api.views({ viewers: [camille.uuid], ids: [main.id, main.id] }),
        () => api.seen({ player: camille.uuid, feed: 'global', upTo: 'now' }),
        () => api.seen({ player: camille.uuid, feed: 'global', upTo: '2026-11-23T21:14:05+01:00' }),
        () => api.seen({ player: camille.uuid, feed: 'all', upTo: '2026-11-23T20:14:05.000Z' }),
        () => api.threadSeen(main.id, 'nope'),
        () => api.ack({ ids: [] }),
        () => api.ack({ ids: Array.from({ length: 101 }, () => randomUUID()) }),
        () => api.ack({ ids: ['nope'] }),
        () => api.announcer(camille.uuid, { announcer: 'yes' }),
        () =>
          api.announcer(camille.uuid, {
            announcer: true,
            issuer: { uuid: camille.uuid, username: 'a b' },
          }),
      ];
      for (const [index, send] of bad.entries()) {
        expect(refusal(await send()), `request ${String(index)}`).toEqual({
          status: 400,
          data: undefined,
        });
      }
    });

    it('takes 200 viewers and 20 IDs, 100 acknowledgements, and 4,000 raw characters', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const answer = await api.views({
        viewers: Array.from({ length: 200 }, () => randomUUID()),
        ids: [main.id, ...Array.from({ length: 19 }, () => randomUUID())],
      });
      expect(answer.status).toBe(200);
      expect((answer.body as { views: unknown[] }).views).toHaveLength(200);
      expect((await api.ack({ ids: Array.from({ length: 100 }, () => randomUUID()) })).status).toBe(
        204,
      );
      // 4,000 raw characters that clean down to nothing are emptyText, not a plain 400.
      expect(refusal(await api.post({ ...postBody(camille), text: ' '.repeat(4000) }))).toEqual(
        problem(400, 'emptyText'),
      );
    });

    it('refuses bad queries with a plain 400', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      for (const query of [
        `feed=news&viewer=${camille.uuid}`,
        `viewer=${camille.uuid}`,
        'feed=global',
        'feed=global&viewer=nope',
        `feed=global&viewer=${camille.uuid}&before=`,
        `feed=global&viewer=${camille.uuid}&before=${'a'.repeat(129)}`,
      ]) {
        expect(refusal(await api.page(query)), query).toEqual({ status: 400, data: undefined });
      }
      expect(refusal(await api.thread(main.id, 'viewer=nope'))).toEqual({
        status: 400,
        data: undefined,
      });
      expect(
        refusal(
          await call(unlike, {
            method: 'DELETE',
            url: `${BASE}/posts/${main.id}/like`,
            params: { id: main.id },
          }),
        ),
      ).toEqual({ status: 400, data: undefined });
      expect(
        refusal(
          await call(deletePost, {
            method: 'DELETE',
            url: `${BASE}/posts/${main.id}?player=nope`,
            params: { id: main.id },
          }),
        ),
      ).toEqual({ status: 400, data: undefined });
    });

    it('refuses forged cursors with a plain 400, never a 500', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const forged = [
        'nope',
        Buffer.from('[1,"x"]').toString('base64url'),
        Buffer.from('{"at":1}').toString('base64url'),
        Buffer.from(`[-1,"${main.id}"]`).toString('base64url'),
        Buffer.from(`[1.5,"${main.id}"]`).toString('base64url'),
        Buffer.from(`["1","${main.id}"]`).toString('base64url'),
        Buffer.from(`[1,"${main.id}",3]`).toString('base64url'),
        '%%%%',
      ];
      for (const cursor of forged) {
        expect(
          refusal(await api.page(`feed=global&viewer=${camille.uuid}&before=${cursor}`)),
          cursor,
        ).toEqual({ status: 400, data: undefined });
        expect(
          refusal(await api.thread(main.id, `viewer=${camille.uuid}&after=${cursor}`)),
          cursor,
        ).toEqual({ status: 400, data: undefined });
      }
      // A well-formed cursor that points anywhere is just a position.
      const anywhere = encodeCursor(new Date('2000-01-01T00:00:00.000Z'), randomUUID());
      expect(
        (await api.page(`feed=global&viewer=${camille.uuid}&before=${anywhere}`)).body,
      ).toMatchObject({ posts: [], next: null });
    });

    // A cursor is a millisecond time: one past the largest Date (8.64e15) would be an Invalid
    // Date, on which the query fails. The mod never sends it; a forged cursor gets a 400.
    it('refuses a cursor whose time is past the largest date with a 400', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const huge = Buffer.from(`[9007199254740991,"${main.id}"]`).toString('base64url');
      expect(huge.length).toBeLessThanOrEqual(128);
      const answer = await api
        .page(`feed=global&viewer=${camille.uuid}&before=${huge}`)
        .catch((error: unknown) => ({ status: 500, error: String(error) }));
      expect(answer.status).toBe(400);
    });

    it('answers a plain 404 for path IDs that are not UUIDs', async () => {
      const camille = await person('Camille Roux');
      for (const id of ['nope', '123', `${randomUUID()}x`, '../players']) {
        const sends = [
          () => api.thread(id, `viewer=${camille.uuid}`),
          () => api.reply(id, replyBody(camille)),
          () => api.like(id, camille.uuid),
          () => api.unlike(id, camille.uuid),
          () => api.pin(id, camille.uuid),
          () => api.unpin(id, camille.uuid),
          () => api.remove(id, camille.uuid),
          () => api.threadSeen(id, camille.uuid),
          () => api.player(id),
          () => api.announcer(id, { announcer: true }),
        ];
        for (const [index, send] of sends.entries()) {
          expect(refusal(await send()), `${id} on route ${String(index)}`).toEqual({
            status: 404,
            data: undefined,
          });
        }
      }
    });
  });

  describe('problem codes by route (section 5)', () => {
    it('posts: notLinked, banned, notAllowed, emptyText, tooLong, idempotencyMismatch', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      expect(refusal(await api.post(postBody({ uuid: randomUUID() })))).toEqual(
        problem(404, 'notLinked'),
      );
      expect(refusal(await api.post(postBody(camille, { feed: 'announcements' })))).toEqual(
        problem(403, 'notAllowed'),
      );
      expect(refusal(await api.post(postBody(camille, { text: '' })))).toEqual(
        problem(400, 'emptyText'),
      );
      expect(refusal(await api.post(postBody(camille, { text: 'a'.repeat(281) })))).toEqual(
        problem(400, 'tooLong'),
      );
      const key = randomUUID();
      expect((await api.post(postBody(camille, { idempotencyKey: key }))).status).toBe(201);
      expect(refusal(await api.post(postBody(mika, { idempotencyKey: key })))).toEqual(
        problem(409, 'idempotencyMismatch'),
      );
      await db.insert(wardenBan).values({ userId: camille.id, reason: 'Spam', source: 'web' });
      const banned = await api.post(postBody(camille));
      expect(refusal(banned)).toEqual(problem(403, 'banned'));
      expect(banned.error?.statusMessage).toBe('banned');
    });

    it('replies: notFound for an unknown, deleted or reply thread and a foreign target', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille, 'Fil');
      const { post: other } = await post(camille, 'Autre fil');
      const { post: r1 } = await reply(mika, main.id);
      const { post: foreign } = await reply(mika, other.id);
      const { post: gone } = await reply(mika, main.id);
      await api.remove(gone.id, mika.uuid);
      const notFound = problem(404, 'notFound');

      expect(refusal(await api.reply(randomUUID(), replyBody(mika)))).toEqual(notFound);
      // A reply's ID where the main post is expected.
      expect(refusal(await api.reply(r1.id, replyBody(mika)))).toEqual(notFound);
      expect(refusal(await api.reply(main.id, replyBody(mika, { replyTo: randomUUID() })))).toEqual(
        notFound,
      );
      expect(refusal(await api.reply(main.id, replyBody(mika, { replyTo: foreign.id })))).toEqual(
        notFound,
      );
      expect(refusal(await api.reply(main.id, replyBody(mika, { replyTo: gone.id })))).toEqual(
        notFound,
      );
      // replyTo names a reply; the main post itself is answered with null.
      expect(refusal(await api.reply(main.id, replyBody(mika, { replyTo: other.id })))).toEqual(
        notFound,
      );
      expect(refusal(await api.reply(main.id, replyBody({ uuid: randomUUID() })))).toEqual(
        problem(404, 'notLinked'),
      );
      expect(refusal(await api.reply(main.id, replyBody(mika, { text: '\n\n' })))).toEqual(
        problem(400, 'emptyText'),
      );
      await api.remove(main.id, camille.uuid);
      expect(refusal(await api.reply(main.id, replyBody(mika)))).toEqual(notFound);
      expect(refusal(await api.reply(main.id, replyBody(mika, { replyTo: r1.id })))).toEqual(
        notFound,
      );
    });

    it('replies: anyone who writes may reply in an announcement’s thread (4.6)', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const mika = await person('Mika Lefort');
      const { post: announcement } = await post(lune, 'Annonce', { feed: 'announcements' });
      const answer = await api.reply(announcement.id, replyBody(mika));
      expect(answer).toMatchObject({
        status: 201,
        body: { post: { feed: 'announcements', threadId: announcement.id, canPin: false } },
      });
    });

    it('likes: notFound on unknown and deleted posts, notLinked, banned', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: created } = await post(camille);
      const { post: answer } = await reply(mika, created.id);
      // Replies can be liked.
      expect((await api.like(answer.id, camille.uuid)).body).toMatchObject({ likes: 1 });
      const notFound = problem(404, 'notFound');
      expect(refusal(await api.like(randomUUID(), mika.uuid))).toEqual(notFound);
      expect(refusal(await api.unlike(randomUUID(), mika.uuid))).toEqual(notFound);
      expect(refusal(await api.like(created.id, randomUUID()))).toEqual(problem(404, 'notLinked'));
      expect(refusal(await api.unlike(created.id, randomUUID()))).toEqual(
        problem(404, 'notLinked'),
      );
      await api.remove(created.id, camille.uuid);
      expect(refusal(await api.like(created.id, mika.uuid))).toEqual(notFound);
      expect(refusal(await api.unlike(created.id, mika.uuid))).toEqual(notFound);
      // The reply went with its thread.
      expect(refusal(await api.unlike(answer.id, camille.uuid))).toEqual(notFound);

      const { post: fresh } = await post(mika);
      await db.insert(wardenBan).values({ userId: mika.id, reason: 'Spam', source: 'web' });
      expect(refusal(await api.like(fresh.id, mika.uuid))).toEqual(problem(403, 'banned'));
      expect(refusal(await api.unlike(fresh.id, mika.uuid))).toEqual(problem(403, 'banned'));
    });

    it('pins: notLinked, banned, notAllowed, notFound, notPinnable, pinLimit with oldest', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const kael = await person('Kael Dubois', { role: 'feed-announcer' });
      const mika = await person('Mika Lefort');
      const ids: string[] = [];
      for (const text of ['A', 'B', 'C', 'D']) {
        ids.push((await post(lune, text, { feed: 'announcements' })).post.id);
      }
      const [A, B, C, D] = ids as [string, string, string, string];
      const { post: global } = await post(lune, 'Global');
      const { post: answer } = await reply(mika, A);

      expect(refusal(await api.pin(A, randomUUID()))).toEqual(problem(404, 'notLinked'));
      expect(refusal(await api.unpin(A, randomUUID()))).toEqual(problem(404, 'notLinked'));
      expect(refusal(await api.pin(A, mika.uuid))).toEqual(problem(403, 'notAllowed'));
      expect(refusal(await api.unpin(A, mika.uuid))).toEqual(problem(403, 'notAllowed'));
      expect(refusal(await api.pin(randomUUID(), kael.uuid))).toEqual(problem(404, 'notFound'));
      expect(refusal(await api.unpin(randomUUID(), kael.uuid))).toEqual(problem(404, 'notFound'));
      expect(refusal(await api.pin(global.id, kael.uuid))).toEqual(problem(409, 'notPinnable'));
      expect(refusal(await api.pin(answer.id, kael.uuid))).toEqual(problem(409, 'notPinnable'));
      // Unpinning what isn't pinned changes nothing, whatever the post: a Global post, a reply.
      for (const id of [global.id, answer.id]) {
        const unpinned = await api.unpin(id, kael.uuid);
        expect(unpinned.status).toBe(200);
        expect(unpinned.body).toEqual({ pinned: [], unpinned: null });
      }

      for (const id of [A, B, C]) expect((await api.pin(id, kael.uuid)).status).toBe(200);
      const full = await api.pin(D, lune.uuid);
      expect(refusal(full)).toEqual(problem(409, 'pinLimit', { oldest: { id: A } }));
      expect(full.error?.statusMessage).toBe('pinLimit');
      // replace: false is the default, said or not.
      expect(refusal(await api.pin(D, lune.uuid, false))).toEqual(
        problem(409, 'pinLimit', { oldest: { id: A } }),
      );
      const replaced = await api.pin(D, lune.uuid, true);
      expect(replaced.status).toBe(200);
      expect(replaced.body).toMatchObject({
        pinned: [{ id: D }, { id: C }, { id: B }],
        unpinned: A,
      });

      await db.insert(wardenBan).values({ userId: kael.id, reason: 'Spam', source: 'web' });
      expect(refusal(await api.pin(A, kael.uuid))).toEqual(problem(403, 'banned'));
      expect(refusal(await api.unpin(B, kael.uuid))).toEqual(problem(403, 'banned'));

      await api.remove(D, lune.uuid);
      expect(refusal(await api.pin(D, lune.uuid))).toEqual(problem(404, 'notFound'));
      expect(refusal(await api.unpin(D, lune.uuid))).toEqual(problem(404, 'notFound'));
    });

    it('deletes: notFound, notLinked, notAllowed (4.9)', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const kael = await person('Kael Dubois', { role: 'feed-announcer' });
      const { post: created } = await post(camille);
      expect(refusal(await api.remove(randomUUID(), camille.uuid))).toEqual(
        problem(404, 'notFound'),
      );
      expect(refusal(await api.remove(created.id, randomUUID()))).toEqual(
        problem(404, 'notLinked'),
      );
      expect(refusal(await api.remove(created.id, mika.uuid))).toEqual(problem(403, 'notAllowed'));
      // An announcer who doesn't moderate deletes only their own.
      expect(refusal(await api.remove(created.id, kael.uuid))).toEqual(problem(403, 'notAllowed'));
      expect((await api.remove(created.id, camille.uuid)).status).toBe(204);
      // Someone who couldn't have deleted it, once it's gone: notFound.
      expect(refusal(await api.remove(created.id, mika.uuid))).toEqual(problem(404, 'notFound'));
    });

    it('threads and thread marks: notFound for unknown, deleted and reply IDs', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const { post: answer } = await reply(camille, main.id);
      const { post: gone } = await post(camille);
      await api.remove(gone.id, camille.uuid);
      for (const id of [randomUUID(), answer.id, gone.id]) {
        expect(refusal(await api.thread(id, `viewer=${camille.uuid}`))).toEqual(
          problem(404, 'notFound'),
        );
        expect(refusal(await api.threadSeen(id, camille.uuid))).toEqual(problem(404, 'notFound'));
        // A guest gets the same answer.
        expect(refusal(await api.threadSeen(id, randomUUID()))).toEqual(problem(404, 'notFound'));
      }
      // A guest's mark of a live thread does nothing and answers 204.
      expect((await api.threadSeen(main.id, randomUUID())).status).toBe(204);
    });

    it('views: leaves out deleted and unknown IDs, in the order sent, for every viewer', async () => {
      const camille = await person('Camille Roux');
      const { post: one } = await post(camille, 'Un');
      const { post: two } = await post(camille, 'Deux');
      const { post: gone } = await post(camille, 'Parti');
      await api.remove(gone.id, camille.uuid);
      const guest = randomUUID();
      const answer = await api.views({
        viewers: [guest, camille.uuid.toUpperCase()],
        ids: [two.id, gone.id, randomUUID(), one.id],
      });
      expect(answer.status).toBe(200);
      const body = answer.body as { views: { viewer: string; posts: { id: string }[] }[] };
      expect(body.views.map((view) => view.posts.map((row) => row.id))).toEqual([
        [two.id, one.id],
        [two.id, one.id],
      ]);
      expect(body.views[0]!.viewer).toBe(guest);
      expect(body.views[1]!.viewer.toLowerCase()).toBe(camille.uuid);
      expect(body.views[1]!.posts[0]).toMatchObject({ mine: true });
    });

    it('announcers: notLinked, issuerNotAllowed, impliedByRole, isGhost (4.14)', async () => {
      const lune = await person('Lune Garnier', { role: 'warden-admin' });
      const mika = await person('Mika Lefort');
      const ghost = await person('Ghost Person', { ghost: true });
      const issuer = { uuid: lune.uuid, username: lune.username };

      expect(refusal(await api.announcer(randomUUID(), { announcer: true, issuer }))).toEqual(
        problem(404, 'notLinked'),
      );
      expect(
        refusal(
          await api.announcer(mika.uuid, {
            announcer: true,
            issuer: { uuid: mika.uuid, username: mika.username },
          }),
        ),
      ).toEqual(problem(403, 'issuerNotAllowed'));
      // An issuer who isn't a linked account at all.
      expect(
        refusal(
          await api.announcer(mika.uuid, {
            announcer: true,
            issuer: { uuid: randomUUID(), username: 'Nobody' },
          }),
        ),
      ).toEqual(problem(403, 'issuerNotAllowed'));
      expect(refusal(await api.announcer(lune.uuid, { announcer: false, issuer }))).toEqual(
        problem(409, 'impliedByRole'),
      );
      expect(refusal(await api.announcer(ghost.uuid, { announcer: true, issuer }))).toEqual(
        problem(409, 'isGhost'),
      );

      const given = await api.announcer(mika.uuid.toUpperCase(), { announcer: true, issuer });
      expect(given).toMatchObject({
        status: 200,
        body: { uuid: mika.uuid, username: mika.username, announcer: true, viaRole: false },
      });
      expect((await api.announcers()).body).toEqual({
        items: [{ realName: 'Mika L.', accounts: [{ uuid: mika.uuid, username: mika.username }] }],
      });
      expect((await api.announcer(mika.uuid, { announcer: false })).body).toMatchObject({
        announcer: false,
      });
    });
  });

  describe('rate limits over HTTP (7)', () => {
    it('answers 429 rateLimited with Retry-After in seconds for posts, replies and likes', async () => {
      limits.mockRestore();
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      for (let i = 0; i < 3; i++) {
        expect((await api.post(postBody(camille, { text: `P${String(i)}` }))).status).toBe(201);
      }
      const refused = await api.post(postBody(camille, { text: 'Quatre' }));
      expect(refusal(refused)).toMatchObject(problem(429, 'rateLimited'));
      expect(refused.error?.statusMessage).toBe('rateLimited');
      const wait = Number(refused.headers.get('retry-after'));
      expect(Number.isInteger(wait)).toBe(true);
      expect(wait).toBeGreaterThanOrEqual(1);
      expect(wait).toBeLessThanOrEqual(60);

      const { post: main } = await post(mika, 'Fil');
      for (let i = 0; i < 6; i++) {
        expect((await api.reply(main.id, replyBody(camille))).status).toBe(201);
      }
      const replyRefused = await api.reply(main.id, replyBody(camille));
      expect(refusal(replyRefused)).toMatchObject(problem(429, 'rateLimited'));
      expect(Number(replyRefused.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);

      for (let i = 0; i < 30; i++) {
        expect((await api.like(main.id, camille.uuid)).status).toBe(200);
        expect((await api.unlike(main.id, camille.uuid)).status).toBe(200);
      }
      const likeRefused = await api.like(main.id, camille.uuid);
      expect(refusal(likeRefused)).toMatchObject(problem(429, 'rateLimited'));
      expect(Number(likeRefused.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
      // Other accounts aren't counted with Camille's.
      expect((await api.like(main.id, mika.uuid)).status).toBe(200);
      // A refusal for another reason sets no Retry-After.
      const other = await api.post(postBody(mika, { feed: 'announcements' }));
      expect(other.headers.get('retry-after')).toBeNull();
    });
  });

  describe('text vectors over HTTP (13.1)', () => {
    const ACUTE = cp(0x301);
    const E_ACUTE = cp(0xe9);
    const a = (n: number) => 'a'.repeat(n);
    const accepted: [input: string, stored: string][] = [
      ['  Salut  ', 'Salut'],
      [`e${ACUTE}te${ACUTE}`, `${E_ACUTE}t${E_ACUTE}`],
      ['\u{1F44D}\u{1F3FD}', '\u{1F44D}\u{1F3FD}'],
      ['\u{1F1EB}\u{1F1F7}', '\u{1F1EB}\u{1F1F7}'],
      [a(280), a(280)],
      [`${a(279)}e${ACUTE}`, a(279) + E_ACUTE],
      ['a\r\nb', 'a\nb'],
      ['a\rb', 'a\nb'],
      ['a\tb', 'a b'],
      [`${cp(0xa7)}cRouge`, 'cRouge'],
      ['a\u0000b\u0085c', 'abc'],
      ['a\n\n\n\nb', 'a\n\nb'],
      [`${cp(0x3000)}bonjour `, 'bonjour'],
      [`${cp(0xfeff)}hi`, `${cp(0xfeff)}hi`],
      [`a${cp(0x200b)}b`, `a${cp(0x200b)}b`],
    ];

    it.each(accepted)('stores %j as %j and answers 201', async (input, stored) => {
      const camille = await person('Camille Roux');
      const answer = await api.post(postBody(camille, { text: input }));
      expect(answer.status).toBe(201);
      const created = (answer.body as { post: { id: string; text: string } }).post;
      expect(created.text).toBe(stored);
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, created.id));
      expect(row!.text).toBe(stored);
    });

    it.each([
      [a(281), 'tooLong'],
      ['   \n   ', 'emptyText'],
      ['', 'emptyText'],
    ])('refuses %j with 400 %s', async (input, code) => {
      const camille = await person('Camille Roux');
      expect(refusal(await api.post(postBody(camille, { text: input })))).toEqual(
        problem(400, code),
      );
    });
  });

  describe('hostile texts', () => {
    it('drops unpaired surrogates sent as JSON escapes, and refuses a text of only those', async () => {
      const camille = await person('Camille Roux');
      const raw = (text: string) =>
        `{"idempotencyKey":"${randomUUID()}","player":"${camille.uuid}","feed":"global","anonymous":false,"text":${text}}`;
      const kept = await api.post(raw('"a\\ud800b\\udc00c\\ud83d\\ude00"'));
      expect(kept.status).toBe(201);
      expect((kept.body as { post: { text: string } }).post.text).toBe('abc\u{1F600}');
      // A lone high, a real pair, a lone low: only the pair stays.
      const paired = await api.post(raw('"\\ud800\\udbff\\udfff\\udc00"'));
      expect(paired.status).toBe(201);
      expect((paired.body as { post: { text: string } }).post.text).toBe(cp(0x10ffff));
      expect(refusal(await api.post(raw('"\\ud800\\ud800"')))).toEqual(problem(400, 'emptyText'));
      expect(refusal(await api.post(raw('"\\udc00\\ud800"')))).toEqual(problem(400, 'emptyText'));
    });

    it('refuses texts of only controls, whitespace or section signs as emptyText', async () => {
      const camille = await person('Camille Roux');
      for (const text of [
        '\u0000\u0001\u001f',
        '\u007f\u0080\u009f',
        `${cp(0xa7)}${cp(0xa7)}`,
        `\t \r\n${cp(0xa0, 0x2028, 0x2029, 0x3000, 0x2003)}`,
        '\r\r\r',
      ]) {
        expect(refusal(await api.post(postBody(camille, { text }))), JSON.stringify(text)).toEqual(
          problem(400, 'emptyText'),
        );
      }
    });

    it('counts astral characters as one: 280 pass, 281 are tooLong', async () => {
      const camille = await person('Camille Roux');
      const smile = cp(0x1f600);
      const ok = await api.post(postBody(camille, { text: smile.repeat(280) }));
      expect(ok.status).toBe(201);
      const stored = (ok.body as { post: { text: string } }).post.text;
      expect(Array.from(stored)).toHaveLength(280);
      expect(refusal(await api.post(postBody(camille, { text: smile.repeat(281) })))).toEqual(
        problem(400, 'tooLong'),
      );
      // 4,000 of them are 8,000 UTF-16 units but 4,000 characters: under the raw cap, then too
      // long.
      expect(refusal(await api.post(postBody(camille, { text: smile.repeat(4000) })))).toEqual(
        problem(400, 'tooLong'),
      );
      // 281 code points that trim down to 280 pass.
      expect((await api.post(postBody(camille, { text: ` ${a280()}` }))).status).toBe(201);
    });
  });

  describe('idempotency over HTTP (13.2)', () => {
    it('follows the vector, with feed.writing coming before the key', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const key = randomUUID();
      const body = postBody(camille, { idempotencyKey: key, text: 'Salut' });
      const first = await api.post(body);
      expect(first).toMatchObject({ status: 201, body: { replayed: false } });
      const id = (first.body as { post: { id: string } }).post.id;
      expect(await api.post(body)).toMatchObject({
        status: 201,
        body: { replayed: true, post: { id } },
      });
      expect(await db.select().from(feedPost)).toHaveLength(1);
      expect(refusal(await api.post({ ...body, text: 'Salut !' }))).toEqual(
        problem(409, 'idempotencyMismatch'),
      );
      expect(refusal(await api.post({ ...body, player: mika.uuid }))).toEqual(
        problem(409, 'idempotencyMismatch'),
      );
      expect((await api.post({ ...body, text: '  Salut  ' })).body).toMatchObject({
        replayed: true,
      });
      // The same key for another feed, anonymity or a reply is another request too.
      expect(refusal(await api.post({ ...body, anonymous: true }))).toEqual(
        problem(409, 'idempotencyMismatch'),
      );
      expect(refusal(await api.post({ ...body, feed: 'announcements' }))).toEqual(
        problem(409, 'idempotencyMismatch'),
      );
      expect(
        refusal(await api.reply(id, replyBody(camille, { idempotencyKey: key, text: 'Salut' }))),
      ).toEqual(problem(409, 'idempotencyMismatch'));

      setFlags({ 'feed.writing': false });
      expect(refusal(await api.post(body))).toEqual(
        problem(503, 'disabled', { flag: 'feed.writing' }),
      );
      setFlags();
      expect((await api.post(body)).body).toMatchObject({ replayed: true, post: { id } });

      expect((await api.remove(id, camille.uuid)).status).toBe(204);
      expect(refusal(await api.post(body))).toEqual(problem(404, 'notFound'));
    });

    it('replays a reply after the replier is banned or the rate is spent', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      const body = replyBody(mika, { text: 'Réponse' });
      const first = await api.reply(main.id, body);
      expect(first.status).toBe(201);
      await db.insert(wardenBan).values({ userId: mika.id, reason: 'Spam', source: 'web' });
      limits.mockRejectedValue(new Error('the rate must not be counted on a replay'));
      expect(await api.reply(main.id, body)).toMatchObject({
        status: 201,
        body: { replayed: true, post: { id: (first.body as { post: { id: string } }).post.id } },
      });
      expect(refusal(await api.reply(main.id, { ...body, replyTo: randomUUID() }))).toEqual(
        problem(409, 'idempotencyMismatch'),
      );
    });
  });

  describe('seen and notifications over HTTP', () => {
    it('marks a feed seen up to a time, never past now, and keeps the later one (4.10)', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: g1 } = await post(mika, 'G1');
      const unread = async () =>
        ((await api.player(camille.uuid)).body as { unread: { global: boolean } }).unread.global;
      expect(await unread()).toBe(true);
      expect(
        (await api.seen({ player: camille.uuid, feed: 'global', upTo: g1.createdAt })).status,
      ).toBe(204);
      expect(await unread()).toBe(false);
      // An older time never moves the mark back.
      await api.seen({ player: camille.uuid, feed: 'global', upTo: '2020-01-01T00:00:00.000Z' });
      expect(await unread()).toBe(false);
      // A time in the future is cut to now: a post made after the call still shows the dot.
      await api.seen({ player: camille.uuid, feed: 'global', upTo: '2999-01-01T00:00:00.000Z' });
      const [member] = await db.select().from(feedMember).where(eq(feedMember.userId, camille.id));
      expect(member!.globalSeenAt!.getTime()).toBeLessThanOrEqual(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 5));
      await post(mika, 'G2');
      expect(await unread()).toBe(true);
      // Announcements keep their own mark.
      expect(member!.announcementsSeenAt).toBeNull();
      // A guest's call answers 204 and stores nothing.
      const guest = randomUUID();
      expect((await api.seen({ player: guest, feed: 'global', upTo: g1.createdAt })).status).toBe(
        204,
      );
    });

    it('lists the queue with its shape, and acknowledging deletes it (4.12, 4.13)', async () => {
      const kael = await person('Kael Dubois', { role: 'feed-announcer', accounts: 2 });
      const camille = await person('Camille Roux');
      const { post: announcement } = await post(kael, 'Annonce', { feed: 'announcements' });
      await reply(camille, announcement.id);
      const listed = await api.notifications();
      expect(listed.status).toBe(200);
      const body = listed.body as { items: { id: string }[]; more: boolean };
      expect(body).toMatchObject({
        more: false,
        items: [
          {
            kind: 'announcement',
            players: null,
            except: kael.accounts.map((account) => account.uuid),
            post: {
              id: announcement.id,
              feed: 'announcements',
              threadId: null,
              text: 'Annonce',
              anonymous: false,
              author: { uuid: kael.uuid, username: kael.username, announcer: true },
            },
          },
          { kind: 'reply', players: kael.accounts.map((account) => account.uuid), except: [] },
        ],
      });
      expect(Object.keys(body.items[0]!).sort()).toEqual(
        ['createdAt', 'except', 'id', 'kind', 'players', 'post'].sort(),
      );
      expect(
        Object.keys((body.items[0] as unknown as { post: Record<string, unknown> }).post).sort(),
      ).toEqual(['anonymous', 'author', 'feed', 'id', 'text', 'threadId']);
      expect((await api.ack({ ids: body.items.map((item) => item.id) })).status).toBe(204);
      expect(await db.select().from(feedNotification)).toEqual([]);
    });
  });
});

function a280() {
  return 'a'.repeat(280);
}

/** Calls a route builder, then replays its request with another Authorization header. */
async function callWithAuth(send: () => Promise<HttpAnswer>, auth: string | null) {
  const original = globalThis.Request;
  // The builders set the secret; this swaps the header on the Request they build.
  globalThis.Request = class extends original {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const headers = new Headers(init?.headers);
      if (auth === null) headers.delete('authorization');
      else headers.set('authorization', auth);
      super(input, { ...init, headers });
    }
  };
  try {
    return await send();
  } finally {
    globalThis.Request = original;
  }
}
