import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { createError } from 'nuxt/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import getMe from '~~/server/api/feed/me.get';
import patchMe from '~~/server/api/feed/me.patch';
import unlike from '~~/server/api/feed/posts/[id]/like.delete';
import like from '~~/server/api/feed/posts/[id]/like.put';
import unpin from '~~/server/api/feed/posts/[id]/pin.delete';
import pin from '~~/server/api/feed/posts/[id]/pin.put';
import createReply from '~~/server/api/feed/posts/[id]/replies.post';
import threadSeen from '~~/server/api/feed/posts/[id]/seen.post';
import deletePost from '~~/server/api/feed/posts/[id].delete';
import getThread from '~~/server/api/feed/posts/[id].get';
import getPage from '~~/server/api/feed/posts/index.get';
import createPost from '~~/server/api/feed/posts/index.post';
import feedSeen from '~~/server/api/feed/seen.post';
import { db } from '~~/server/db';
import { feedPost, user, wardenBan } from '~~/server/db/schema';
import { feedLimits } from '~~/server/services/feed/shared';

import { call, person, post, reply, setFlags, stubServerUtils, wipe } from './feed-helpers';
import type { HttpAnswer, Person } from './feed-helpers';

// The browser's Feed routes at the HTTP level (docs/feed.md, "For the browser"): each handler is
// called as Nitro calls it, signed in as a test person, so the statuses, `data.problem`,
// `data.flag` and `Retry-After` the Feed page reads are the ones checked.

const BASE = '/api/feed';
const SIGNED_IN = 'x-test-user';

/** The session's user, from the test header: the handlers' `requireUser`. */
async function requireTestUser(event: { req: Request }) {
  const id = event.req.headers.get(SIGNED_IN);
  const [row] = id ? await db.select().from(user).where(eq(user.id, id)) : [];
  if (!row) throw createError({ status: 401, statusText: 'Unauthorized' });
  return row;
}

type As = Person | { id: string } | null;

function send(
  handler: Parameters<typeof call>[0],
  as: As,
  request: Omit<Parameters<typeof call>[1], 'auth' | 'headers'>,
) {
  return call(handler, {
    ...request,
    auth: null,
    headers: as ? { [SIGNED_IN]: as.id } : {},
  });
}

const api = {
  me: (as: As) => send(getMe, as, { method: 'GET', url: `${BASE}/me` }),
  patchMe: (as: As, body: unknown) =>
    send(patchMe, as, { method: 'PATCH', url: `${BASE}/me`, body }),
  page: (as: As, query: string) =>
    send(getPage, as, { method: 'GET', url: `${BASE}/posts?${query}` }),
  thread: (as: As, id: string, query = '') =>
    send(getThread, as, { method: 'GET', url: `${BASE}/posts/${id}?${query}`, params: { id } }),
  post: (as: As, body: unknown) =>
    send(createPost, as, { method: 'POST', url: `${BASE}/posts`, body }),
  reply: (as: As, id: string, body: unknown) =>
    send(createReply, as, {
      method: 'POST',
      url: `${BASE}/posts/${id}/replies`,
      params: { id },
      body,
    }),
  like: (as: As, id: string) =>
    send(like, as, { method: 'PUT', url: `${BASE}/posts/${id}/like`, params: { id } }),
  unlike: (as: As, id: string) =>
    send(unlike, as, { method: 'DELETE', url: `${BASE}/posts/${id}/like`, params: { id } }),
  pin: (as: As, id: string, body?: unknown) =>
    send(pin, as, { method: 'PUT', url: `${BASE}/posts/${id}/pin`, params: { id }, body }),
  unpin: (as: As, id: string) =>
    send(unpin, as, { method: 'DELETE', url: `${BASE}/posts/${id}/pin`, params: { id } }),
  remove: (as: As, id: string) =>
    send(deletePost, as, { method: 'DELETE', url: `${BASE}/posts/${id}`, params: { id } }),
  seen: (as: As, body: unknown) =>
    send(feedSeen, as, { method: 'POST', url: `${BASE}/seen`, body }),
  threadSeen: (as: As, id: string) =>
    send(threadSeen, as, { method: 'POST', url: `${BASE}/posts/${id}/seen`, params: { id } }),
};

function postBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    feed: 'global',
    text: 'Depuis le site',
    anonymous: false,
    ...overrides,
  };
}

function replyBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    replyTo: null,
    text: 'Moi !',
    anonymous: false,
    ...overrides,
  };
}

function refusal(answer: HttpAnswer) {
  return { status: answer.status, data: answer.error?.data };
}

function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
  return { status, data: { problem: code, ...extra } };
}

/** Every browser route, with a request that would otherwise be accepted. */
function everyRoute(as: As, id: string) {
  return {
    'GET /me': () => api.me(as),
    'PATCH /me': () => api.patchMe(as, { postingAccount: randomUUID() }),
    'GET /posts': () => api.page(as, 'feed=global'),
    'GET /posts/:id': () => api.thread(as, id),
    'POST /posts': () => api.post(as, postBody()),
    'POST /posts/:id/replies': () => api.reply(as, id, replyBody()),
    'PUT /posts/:id/like': () => api.like(as, id),
    'DELETE /posts/:id/like': () => api.unlike(as, id),
    'PUT /posts/:id/pin': () => api.pin(as, id),
    'DELETE /posts/:id/pin': () => api.unpin(as, id),
    'DELETE /posts/:id': () => api.remove(as, id),
    'POST /seen': () => api.seen(as, { feed: 'global', upTo: '2026-11-23T20:14:05.000Z' }),
    'POST /posts/:id/seen': () => api.threadSeen(as, id),
  };
}

describe('Feed browser routes over HTTP', () => {
  let limits: MockInstance<typeof feedLimits.check>;

  beforeAll(() => {
    stubServerUtils();
    vi.stubGlobal('requireUser', requireTestUser);
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

  describe('sign-in and flags', () => {
    it('refuses every route with a plain 401 when signed out, before the flags', async () => {
      setFlags({ feed: false });
      const routes = everyRoute(null, randomUUID());
      expect(Object.keys(routes)).toHaveLength(13);
      for (const [name, request] of Object.entries(routes)) {
        expect(refusal(await request()), name).toEqual({ status: 401, data: undefined });
      }
    });

    it('answers 503 disabled on every route while feed is off', async () => {
      const camille = await person('Camille Roux');
      setFlags({ feed: false });
      for (const [name, request] of Object.entries(everyRoute(camille, randomUUID()))) {
        const answer = await request();
        expect(refusal(answer), name).toEqual(problem(503, 'disabled', { flag: 'feed' }));
      }
    });

    it('with feed.writing off, refuses posting, replying and liking, and nothing else', async () => {
      const camille = await person('Camille Roux');
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      const { post: main } = await post(camille, 'Fil');
      const { post: announcement } = await post(lune, 'Annonce', { feed: 'announcements' });
      setFlags({ 'feed.writing': false });

      const off = problem(503, 'disabled', { flag: 'feed.writing' });
      expect(refusal(await api.post(camille, postBody()))).toEqual(off);
      expect(refusal(await api.reply(camille, main.id, replyBody()))).toEqual(off);
      expect(refusal(await api.like(camille, main.id))).toEqual(off);
      expect(refusal(await api.unlike(camille, main.id))).toEqual(off);

      expect((await api.me(camille)).body).toMatchObject({
        writing: false,
        rights: { write: true },
      });
      expect((await api.page(camille, 'feed=global')).status).toBe(200);
      expect((await api.thread(camille, main.id)).status).toBe(200);
      expect((await api.threadSeen(camille, main.id)).status).toBe(204);
      expect((await api.seen(camille, { feed: 'global', upTo: main.createdAt })).status).toBe(204);
      expect((await api.patchMe(camille, { postingAccount: camille.uuid })).status).toBe(200);
      expect((await api.pin(lune, announcement.id)).status).toBe(200);
      expect((await api.unpin(lune, announcement.id)).status).toBe(200);
      expect((await api.remove(camille, main.id)).status).toBe(204);
    });
  });

  describe('the person and the posting account', () => {
    it('answers GET /me with the accounts and the posting account', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      const answer = await api.me(lea);
      expect(answer.status).toBe(200);
      expect(answer.body).toEqual({
        linked: true,
        banned: false,
        banExpiresAt: null,
        writing: true,
        rights: { write: true, announce: false, moderate: false },
        me: { uuid: lea.uuid, username: lea.username, realName: 'Léa B.', announcer: false },
        unread: { announcements: false, global: false },
        accounts: lea.accounts,
        postingAccount: lea.uuid,
      });
    });

    it('remembers the account picked with PATCH /me, for posts and replies', async () => {
      const lea = await person('Léa Bernard', { accounts: 2 });
      const second = lea.accounts[1]!;
      const answer = await api.patchMe(lea, { postingAccount: second.uuid });
      expect(answer.status).toBe(200);
      expect(answer.body).toMatchObject({
        postingAccount: second.uuid,
        me: { uuid: second.uuid, username: second.username },
      });
      expect((await api.me(lea)).body).toMatchObject({ postingAccount: second.uuid });

      const created = await api.post(lea, postBody());
      expect(created.body).toMatchObject({ post: { author: { uuid: second.uuid } } });
      const id = (created.body as { post: { id: string } }).post.id;
      const answered = await api.reply(lea, id, replyBody());
      expect(answered.body).toMatchObject({ post: { author: { uuid: second.uuid } } });
    });

    it('refuses an account that is not one of the person’s with 404 notLinked', async () => {
      const lea = await person('Léa Bernard');
      const mika = await person('Mika Lefort');
      for (const uuid of [mika.uuid, randomUUID()]) {
        expect(refusal(await api.patchMe(lea, { postingAccount: uuid }))).toEqual(
          problem(404, 'notLinked'),
        );
      }
      for (const body of [{}, { postingAccount: 'LeaBuilds' }, null, '{']) {
        expect(refusal(await api.patchMe(lea, body)), JSON.stringify(body)).toEqual({
          status: 400,
          data: undefined,
        });
      }
    });

    it('reads only without a linked account', async () => {
      const noa = await person('Noa Petit', { accounts: 0 });
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      expect((await api.me(noa)).body).toMatchObject({
        linked: false,
        me: null,
        accounts: [],
        postingAccount: null,
        rights: { write: false },
      });
      expect((await api.page(noa, 'feed=global')).status).toBe(200);
      expect(refusal(await api.post(noa, postBody()))).toEqual(problem(404, 'notLinked'));
      expect(refusal(await api.reply(noa, main.id, replyBody()))).toEqual(
        problem(404, 'notLinked'),
      );
      expect(refusal(await api.like(noa, main.id))).toEqual(problem(404, 'notLinked'));
    });

    it('gives the end of a Warden ban, and refuses writing while it lasts', async () => {
      const mika = await person('Mika Lefort');
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      const expiresAt = new Date(Date.now() + 86_400_000);
      await db.insert(wardenBan).values({
        userId: mika.id,
        reason: 'Test',
        source: 'web',
        expiresAt,
      });
      expect((await api.me(mika)).body).toMatchObject({
        banned: true,
        banExpiresAt: expiresAt.toISOString(),
        rights: { write: false },
      });
      expect(refusal(await api.post(mika, postBody()))).toEqual(problem(403, 'banned'));
      expect(refusal(await api.like(mika, main.id))).toEqual(problem(403, 'banned'));
      expect((await api.page(mika, 'feed=global')).status).toBe(200);
    });
  });

  describe('reading', () => {
    it('answers a page and a thread for the signed-in person', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille, 'Fil');
      await reply(mika, main.id);
      const page = await api.page(camille, 'feed=global');
      expect(page.status).toBe(200);
      expect(page.body).toMatchObject({
        feed: 'global',
        pinned: [],
        posts: [{ id: main.id, mine: true, replies: 1, unseenReplies: 1 }],
        next: null,
      });
      const thread = await api.thread(camille, main.id);
      expect(thread.body).toMatchObject({
        post: { id: main.id, mine: true },
        replies: [{ threadId: main.id, mine: false, answersMe: true }],
        next: null,
      });
      expect((await api.threadSeen(camille, main.id)).status).toBe(204);
      expect((await api.page(camille, 'feed=global')).body).toMatchObject({
        posts: [{ id: main.id, unseenReplies: 0 }],
      });
    });

    it('pages with a cursor, and refuses a bad query or ID', async () => {
      const mika = await person('Mika Lefort');
      for (let i = 0; i < 3; i++) await post(mika, `P${String(i)}`);
      const first = await api.page(mika, 'feed=global&limit=2');
      const { posts, next } = first.body as { posts: unknown[]; next: string };
      expect(posts).toHaveLength(2);
      const second = await api.page(mika, `feed=global&limit=2&before=${next}`);
      expect((second.body as { posts: unknown[]; next: null }).posts).toHaveLength(1);
      for (const query of ['', 'feed=news', 'feed=global&limit=0', 'feed=global&before=forged']) {
        expect(refusal(await api.page(mika, query)), query).toEqual({
          status: 400,
          data: undefined,
        });
      }
      expect(refusal(await api.thread(mika, 'nope'))).toEqual({ status: 404, data: undefined });
      expect(refusal(await api.thread(mika, randomUUID()))).toEqual(problem(404, 'notFound'));
      expect(refusal(await api.threadSeen(mika, randomUUID()))).toEqual(problem(404, 'notFound'));
    });

    it('marks a feed seen, clearing its unread dot', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(mika);
      expect((await api.me(camille)).body).toMatchObject({ unread: { global: true } });
      expect((await api.seen(camille, { feed: 'global', upTo: main.createdAt })).status).toBe(204);
      expect((await api.me(camille)).body).toMatchObject({ unread: { global: false } });
      for (const body of [
        { feed: 'global', upTo: 'now' },
        { feed: 'all', upTo: main.createdAt },
      ]) {
        expect(refusal(await api.seen(camille, body))).toEqual({ status: 400, data: undefined });
      }
    });
  });

  describe('writing', () => {
    it('posts with 201, and replays the same key without posting twice', async () => {
      const camille = await person('Camille Roux');
      const body = postBody({ text: '  Salut  ' });
      const first = await api.post(camille, body);
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        replayed: false,
        post: { text: 'Salut', mine: true, author: { uuid: camille.uuid } },
      });
      const again = await api.post(camille, body);
      expect(again.status).toBe(201);
      expect(again.body).toMatchObject({ replayed: true });
      expect(await db.select().from(feedPost)).toHaveLength(1);
      expect(refusal(await api.post(camille, { ...body, text: 'Autre' }))).toEqual(
        problem(409, 'idempotencyMismatch'),
      );
    });

    it('refuses an announcement from a player, empty and long texts', async () => {
      const camille = await person('Camille Roux');
      expect(refusal(await api.post(camille, postBody({ feed: 'announcements' })))).toEqual(
        problem(403, 'notAllowed'),
      );
      expect(refusal(await api.post(camille, postBody({ text: ' \n ' })))).toEqual(
        problem(400, 'emptyText'),
      );
      expect(refusal(await api.post(camille, postBody({ text: 'a'.repeat(281) })))).toEqual(
        problem(400, 'tooLong'),
      );
      expect(refusal(await api.post(camille, postBody({ idempotencyKey: 'k' })))).toEqual({
        status: 400,
        data: undefined,
      });
    });

    it('lets an announcer post an anonymous announcement', async () => {
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      const answer = await api.post(lune, postBody({ feed: 'announcements', anonymous: true }));
      expect(answer.status).toBe(201);
      expect(answer.body).toMatchObject({
        post: { feed: 'announcements', anonymous: true, mine: true, author: { uuid: lune.uuid } },
      });
    });

    it('replies to the main post and to a reply, and refuses an unknown thread', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort', { showRealName: false });
      const { post: main } = await post(camille);
      const { post: first } = await reply(mika, main.id);
      const answer = await api.reply(camille, main.id, replyBody({ replyTo: first.id }));
      expect(answer.status).toBe(201);
      expect(answer.body).toMatchObject({
        post: {
          threadId: main.id,
          replyTo: { id: first.id, anonymous: false, name: mika.username },
        },
      });
      expect(refusal(await api.reply(camille, randomUUID(), replyBody()))).toEqual(
        problem(404, 'notFound'),
      );
      expect(refusal(await api.reply(camille, first.id, replyBody()))).toEqual(
        problem(404, 'notFound'),
      );
    });

    it('sets Retry-After when a per-account limit refuses', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille);
      limits.mockImplementation(() =>
        Promise.reject(
          createError({
            status: 429,
            statusText: 'rateLimited',
            data: { problem: 'rateLimited', retryAfter: 42 },
          }),
        ),
      );
      for (const answer of [
        await api.post(camille, postBody()),
        await api.reply(camille, main.id, replyBody()),
        await api.like(camille, main.id),
        await api.unlike(camille, main.id),
      ]) {
        expect(refusal(answer)).toEqual(problem(429, 'rateLimited', { retryAfter: 42 }));
        expect(answer.headers.get('Retry-After')).toBe('42');
      }
    });

    it('likes and unlikes, answering the state after the call', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      expect(await api.like(mika, main.id)).toMatchObject({
        status: 200,
        body: { id: main.id, likes: 1, liked: true },
      });
      expect((await api.like(mika, main.id)).body).toEqual({ id: main.id, likes: 1, liked: true });
      expect((await api.unlike(mika, main.id)).body).toEqual({
        id: main.id,
        likes: 0,
        liked: false,
      });
      expect(refusal(await api.like(mika, randomUUID()))).toEqual(problem(404, 'notFound'));
    });
  });

  describe('pins', () => {
    it('pins with or without a body, refuses a fourth pin, and replaces the oldest', async () => {
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        ids.push((await post(lune, `A${String(i)}`, { feed: 'announcements' })).post.id);
      }
      expect((await api.pin(lune, ids[0]!)).status).toBe(200);
      expect((await api.pin(lune, ids[1]!, {})).status).toBe(200);
      expect((await api.pin(lune, ids[2]!, { replace: false })).status).toBe(200);
      expect(refusal(await api.pin(lune, ids[3]!))).toEqual(
        problem(409, 'pinLimit', { oldest: { id: ids[0] } }),
      );
      const replaced = await api.pin(lune, ids[3]!, { replace: true });
      expect(replaced.body).toMatchObject({ unpinned: ids[0] });
      expect((replaced.body as { pinned: { id: string }[] }).pinned.map((pin) => pin.id)).toEqual([
        ids[3],
        ids[2],
        ids[1],
      ]);
      const unpinned = await api.unpin(lune, ids[3]!);
      expect(unpinned.body).toMatchObject({ unpinned: null });
      expect(refusal(await api.pin(lune, ids[3]!, { replace: 'yes' }))).toEqual({
        status: 400,
        data: undefined,
      });
    });

    it('refuses pins from players and on Global posts', async () => {
      const lune = await person('Lune Garnier', { role: 'feed-announcer' });
      const camille = await person('Camille Roux');
      const { post: announcement } = await post(lune, 'Annonce', { feed: 'announcements' });
      const { post: global } = await post(camille);
      expect(refusal(await api.pin(camille, announcement.id))).toEqual(problem(403, 'notAllowed'));
      expect(refusal(await api.unpin(camille, announcement.id))).toEqual(
        problem(403, 'notAllowed'),
      );
      expect(refusal(await api.pin(lune, global.id))).toEqual(problem(409, 'notPinnable'));
    });
  });

  describe('deleting', () => {
    it('deletes one’s own post with 204, again for one already deleted', async () => {
      const camille = await person('Camille Roux');
      const { post: main } = await post(camille, 'Fil', { anonymous: true });
      for (let i = 0; i < 2; i++) {
        const answer = await api.remove(camille, main.id);
        expect(answer.status).toBe(204);
        expect(answer.body).toBeNull();
      }
      expect(refusal(await api.thread(camille, main.id))).toEqual(problem(404, 'notFound'));
    });

    it('refuses someone else’s post, to moderators too', async () => {
      const camille = await person('Camille Roux');
      const ines = await person('Inès Rivière', { role: 'warden-admin' });
      const mika = await person('Mika Lefort');
      const { post: main } = await post(camille);
      for (const who of [ines, mika]) {
        expect(refusal(await api.remove(who, main.id)), who.name).toEqual(
          problem(403, 'notAllowed'),
        );
      }
      expect(refusal(await api.remove(camille, randomUUID()))).toEqual(problem(404, 'notFound'));
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, main.id));
      expect(row?.deletedAt).toBeNull();
    });

    it('lets a banned person delete their own post', async () => {
      const mika = await person('Mika Lefort');
      const { post: main } = await post(mika);
      await db.insert(wardenBan).values({ userId: mika.id, reason: 'Test', source: 'web' });
      expect((await api.remove(mika, main.id)).status).toBe(204);
    });
  });
});
