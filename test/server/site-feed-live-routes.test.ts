import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import getEvents from '~~/server/api/feed/events.get';
import getViews from '~~/server/api/feed/views.get';
import { db } from '~~/server/db';
import { minecraftServerEvent, wardenBan } from '~~/server/db/schema';
import { feedAnnouncerService } from '~~/server/services/feed/announcers';
import { FEED_LIVE_LIMITS, createFeedLiveHub, feedLiveHub } from '~~/server/services/feed/live';
import { feedPostService } from '~~/server/services/feed/posts';
import { feedLimits } from '~~/server/services/feed/shared';
import { minecraftEventService } from '~~/server/services/minecraft-events';
import { streamFeedLive } from '~~/server/utils/feed-live';

import { BASE, api, problem, refusal, requireTestUser } from './feed-browser-helpers';
import type { As } from './feed-browser-helpers';
import {
  call,
  latestEvent,
  person,
  post,
  reply,
  setFlags,
  stubServerUtils,
  wipe,
} from './feed-helpers';
import { closeOpened, openStream } from './feed-live-http-helpers';

// The browser's live routes against the contract (docs/feed.md, "For the browser" and "Live
// updates in the browser"): GET /views for every kind of reader and every shape of `ids`, GET
// /events's guards, headers, first ping and caps, and what the stream carries end to end through
// the real services, which must be the same for every reader and never name an anonymous author.

// Nitro brings h3 to the server bundle; the site doesn't depend on it, so the test loads the h3
// that Nitro uses, from pnpm's store.
vi.mock('h3', () => {
  const store = fileURLToPath(new URL('../../node_modules/.pnpm/', import.meta.url));
  const version = readdirSync(store).find((name) => /^h3@1\./.test(name));
  if (!version) throw new Error('h3 1.x is not installed');
  return import(`${store}${version}/node_modules/h3/dist/index.mjs`);
});

function views(as: As, ids: string) {
  return call(getViews, {
    method: 'GET',
    url: `${BASE}/views?ids=${ids}`,
    auth: null,
    headers: as ? { 'x-test-user': as.id } : {},
  });
}

const postsOf = (answer: { body: unknown }) =>
  (answer.body as { posts: { id: string; [key: string]: unknown }[] }).posts;

/** A hub of its own on the real topic, quick enough for a test, with the limits a test sets. */
function quickHub(limits: Partial<typeof FEED_LIVE_LIMITS> = {}) {
  return createFeedLiveHub(
    {
      source: {
        latestId: () => minecraftEventService.latestId('feed'),
        since: (afterId, limit) => minecraftEventService.since('feed', afterId, limit),
      },
      enabled: () => Promise.resolve(true),
      log: () => {},
    },
    { ...FEED_LIVE_LIMITS, pollMs: 25, ...limits },
  );
}

/** The stream route on a given hub, behind the same guards as the real route. */
const streamOn = (hub: ReturnType<typeof quickHub>) => async (event: never) => {
  const who = await requireTestUser(event);
  return streamFeedLive(event, who.id, hub);
};

describe('the live routes, against the contract', () => {
  beforeAll(() => {
    stubServerUtils();
    vi.stubGlobal('requireUser', requireTestUser);
    vi.stubGlobal('streamFeedLive', streamFeedLive);
    vi.stubGlobal('getAuthSession', () => Promise.resolve({ user: {}, session: {} }));
  });
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
  });
  afterEach(() => {
    closeOpened();
  });
  afterAll(async () => {
    feedLiveHub.closeAll();
    await wipe();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('GET /views', () => {
    it('checks the session, then feed, then the query', async () => {
      const camille = await person('Camille Roux');
      const bad = 'not-a-uuid';
      expect(refusal(await views(null, bad))).toEqual({ status: 401, data: undefined });
      setFlags({ feed: false });
      expect(refusal(await views(null, bad))).toEqual({ status: 401, data: undefined });
      expect(refusal(await views(camille, bad))).toEqual(
        problem(503, 'disabled', { flag: 'feed' }),
      );
      setFlags();
      expect(refusal(await views(camille, bad))).toEqual({ status: 400, data: undefined });
    });

    it('answers exactly 1 and exactly 20 posts, in the order asked', async () => {
      const camille = await person('Camille Roux');
      const made = [];
      for (let n = 0; n < 20; n++) made.push((await post(camille, `Post ${String(n)}`)).post.id);
      const one = await views(camille, made[7]!);
      expect(one.status).toBe(200);
      expect(postsOf(one).map((view) => view.id)).toEqual([made[7]]);
      const reversed = [...made].reverse();
      const twenty = await views(camille, reversed.join(','));
      expect(postsOf(twenty).map((view) => view.id)).toEqual(reversed);
      expect(Object.keys(twenty.body as object)).toEqual(['posts']);
      const over = await views(camille, [...made, randomUUID()].join(','));
      expect(refusal(over)).toEqual({ status: 400, data: undefined });
    });

    it('refuses every malformed `ids` with a plain 400 and answers nothing', async () => {
      const camille = await person('Camille Roux');
      const id = randomUUID();
      const other = randomUUID();
      const malformed = [
        '',
        ',',
        `${id},,${other}`,
        `,${id}`,
        `${id},`,
        ` ${id}`,
        `${id}%20`,
        `${id};${other}`,
        `{${id}}`,
        `${id}${other}`,
        id.replaceAll('-', ''),
        id.slice(0, 35),
        `${id}'--`,
        `${id}%00`,
        '*',
        'null',
        '[]',
        'x'.repeat(801),
        Array.from({ length: 22 }, () => randomUUID()).join(','),
        // Versions and variants that aren't UUIDs.
        '00000000-0000-0000-0000-00000000000g',
      ];
      for (const ids of malformed) {
        expect(refusal(await views(camille, ids)), ids).toEqual({ status: 400, data: undefined });
      }
      // The parameter given twice is an array, not a list.
      const twice = await call(getViews, {
        method: 'GET',
        url: `${BASE}/views?ids=${id}&ids=${other}`,
        auth: null,
        headers: { 'x-test-user': camille.id },
      });
      expect(twice.status).toBe(400);
    });

    it('refuses a repeated ID wherever it is, and in a list of twenty', async () => {
      const camille = await person('Camille Roux');
      const ids = Array.from({ length: 19 }, () => randomUUID());
      for (const repeated of [
        [ids[0]!, ...ids],
        [...ids, ids[18]!],
        [...ids.slice(0, 9), ids[0]!, ...ids.slice(9)],
        [ids[0]!, ids[0]!],
      ]) {
        expect(refusal(await views(camille, repeated.join(','))), String(repeated.length)).toEqual({
          status: 400,
          data: undefined,
        });
      }
      expect((await views(camille, ids.join(','))).status).toBe(200);
    });

    // DEFECT (low, server/services/feed/views.ts, `liveByIds`): the posts are matched back to the
    // IDs asked by string, but PostgreSQL finds a uuid whatever its case. A valid UUID written in
    // capitals is accepted by the schema (and a repeat that differs only in case passes the
    // distinct check), then looked up by a key that never matches: its post is answered as
    // unknown. The site never writes IDs in capitals, so this needs a hand-made request.
    it.fails('answers a post asked for by its ID in capitals', async () => {
      const camille = await person('Camille Roux');
      const { post: made } = await post(camille);
      expect(postsOf(await views(camille, made.id.toUpperCase())).map((view) => view.id)).toEqual([
        made.id,
      ]);
    });

    it('leaves out deleted posts, replies that went with their thread, and unknown IDs', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Laurent');
      const { post: main } = await post(camille, 'Fil');
      const { post: answer } = await reply(mika, main.id);
      const { post: kept } = await post(camille, 'Reste');
      await feedPostService.remove({
        actor: { source: 'site', userId: camille.id },
        postId: main.id,
      });
      const ids = [main.id, answer.id, kept.id, randomUUID()];
      expect(postsOf(await views(mika, ids.join(','))).map((view) => view.id)).toEqual([kept.id]);
      // All of them gone or unknown: an empty answer, not an error.
      const none = await views(mika, [main.id, answer.id].join(','));
      expect(none.status).toBe(200);
      expect(postsOf(none)).toEqual([]);
    });

    it('shows each reader their own like, ownership and anonymous authors', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Laurent');
      const { post: made } = await post(mika, 'Anonyme', { anonymous: true });
      await api.like(camille, made.id);
      const seen = postsOf(await views(camille, made.id))[0]!;
      expect(seen).toMatchObject({
        liked: true,
        likes: 1,
        mine: false,
        anonymous: true,
        author: null,
      });
      const own = postsOf(await views(mika, made.id))[0]!;
      expect(own).toMatchObject({ liked: false, likes: 1, mine: true });
      expect(own.author).toMatchObject({ uuid: mika.uuid, username: mika.username });
      // A third person sees neither.
      const lea = await person('Léa Martin');
      expect(postsOf(await views(lea, made.id))[0]).toMatchObject({
        liked: false,
        mine: false,
        author: null,
        canDelete: false,
      });
    });

    it('gives a moderator the author of an anonymous post, and no delete on it', async () => {
      const mika = await person('Mika Laurent');
      const moderator = await person('Morgane Admin', { role: 'warden-admin' });
      const { post: made } = await post(mika, 'Anonyme', { anonymous: true });
      const seen = postsOf(await views(moderator, made.id))[0]!;
      expect(seen).toMatchObject({ mine: false, canDelete: false, anonymous: true });
      expect(seen.author).toMatchObject({ uuid: mika.uuid });
    });

    it('gives a banned person their reads and their own delete, and no pin', async () => {
      const kael = await person('Kael Announcer', { role: 'feed-announcer' });
      const mika = await person('Mika Laurent');
      const { post: own } = await post(kael, 'Annonce', { feed: 'announcements' });
      const { post: theirs } = await post(mika, 'Autre');
      const before = postsOf(await views(kael, own.id))[0]!;
      expect(before).toMatchObject({ canPin: true, canDelete: true, mine: true });
      await db.insert(wardenBan).values({ userId: kael.id, reason: 'Test', source: 'web' });
      const answer = await views(kael, `${own.id},${theirs.id}`);
      expect(answer.status).toBe(200);
      const [mine, other] = postsOf(answer);
      expect(mine).toMatchObject({ canPin: false, canDelete: true, mine: true });
      expect(other).toMatchObject({ canPin: false, canDelete: false, mine: false });
    });

    it('lets a moderator pin announcements and delete only their own, as the browser does', async () => {
      const moderator = await person('Morgane Admin', { role: 'admin' });
      const mika = await person('Mika Laurent');
      const { post: announcement } = await post(mika, 'Pas une annonce possible');
      const { post: theirs } = await post(moderator, 'Annonce', { feed: 'announcements' });
      const [global, announced] = postsOf(
        await views(moderator, `${announcement.id},${theirs.id}`),
      );
      expect(global).toMatchObject({ canPin: false, canDelete: false });
      expect(announced).toMatchObject({ canPin: true, canDelete: true, mine: true });
    });

    it('answers a reply with what answers the reader, and names no anonymous author in its replyTo', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Laurent');
      const { post: main } = await post(camille, 'Fil');
      const { post: first } = await reply(mika, main.id, null, { anonymous: true });
      const { post: second } = await reply(camille, main.id, first.id);
      const [view] = postsOf(await views(camille, second.id));
      expect(view).toMatchObject({
        threadId: main.id,
        mine: true,
        answersMe: false,
        replyTo: { id: first.id, anonymous: true, name: null },
      });
      const [toMe] = postsOf(await views(camille, first.id));
      expect(toMe).toMatchObject({ answersMe: true, mine: false, author: null });
    });

    it('works for a person with no linked account, who only reads', async () => {
      const mika = await person('Mika Laurent');
      const guest = await person('Sans Compte', { accounts: 0 });
      const { post: made } = await post(mika, 'Public');
      const [view] = postsOf(await views(guest, made.id));
      expect(view).toMatchObject({ id: made.id, liked: false, mine: false, canDelete: false });
    });
  });

  describe('GET /events: guards and opening', () => {
    it('checks the session first, then feed, then feed.live', async () => {
      const camille = await person('Camille Roux');
      setFlags({ feed: false, 'feed.live': false });
      expect((await openStream(getEvents, null)).status).toBe(401);
      expect((await openStream(getEvents, camille)).error).toEqual({
        statusCode: 503,
        data: { problem: 'disabled', flag: 'feed' },
      });
      setFlags({ 'feed.live': false });
      expect((await openStream(getEvents, camille)).error).toEqual({
        statusCode: 503,
        data: { problem: 'disabled', flag: 'feed.live' },
      });
      // With only feed.writing off the stream is on.
      setFlags({ 'feed.writing': false });
      expect((await openStream(getEvents, camille)).status).toBe(200);
      expect(feedLiveHub.stats().connections).toBe(1);
    });

    it('sends nothing, not even headers, with a refusal', async () => {
      const camille = await person('Camille Roux');
      setFlags({ 'feed.live': false });
      const refused = await openStream(getEvents, camille);
      expect(refused.streaming).toBe(false);
      expect(refused.headers.get('content-type')).toBeUndefined();
      expect(feedLiveHub.stats().connections).toBe(0);
    });

    it('opens for a person with no linked account and for a banned one', async () => {
      const guest = await person('Sans Compte', { accounts: 0 });
      const banned = await person('Bob Banni');
      await db.insert(wardenBan).values({ userId: banned.id, reason: 'Test', source: 'web' });
      for (const who of [guest, banned]) {
        const stream = await openStream(getEvents, who);
        expect(stream.status).toBe(200);
        expect((await stream.read((events) => events.length > 0))[0]!.event).toBe('ping');
      }
    });

    it('answers with the headers a proxy needs to leave the stream alone', async () => {
      const camille = await person('Camille Roux');
      const stream = await openStream(getEvents, camille);
      expect(stream.headers.get('content-type')).toBe('text/event-stream');
      const cache = String(stream.headers.get('cache-control'));
      for (const directive of ['no-cache', 'no-store', 'no-transform']) {
        expect(cache).toContain(directive);
      }
      expect(stream.headers.get('x-accel-buffering')).toBe('no');
    });

    it('opens with a ping carrying the newest ID of the topic, 0 when it has none', async () => {
      const camille = await person('Camille Roux');
      const empty = await openStream(getEvents, camille);
      expect((await empty.read((events) => events.length > 0))[0]).toEqual({
        id: '0',
        event: 'ping',
        data: '{}',
      });
      empty.close();
      await post(camille, 'Un');
      await post(camille, 'Deux');
      const latest = await latestEvent();
      expect(latest).toBeGreaterThan(0);
      const stream = await openStream(getEvents, camille);
      expect((await stream.read((events) => events.length > 0))[0]!.id).toBe(String(latest));
    });

    it('sends a ping carrying the last event read after a quiet moment, private ones included', async () => {
      const camille = await person('Camille Roux');
      const hub = quickHub({ pingMs: 150 });
      const stream = await openStream(streamOn(hub), camille);
      await stream.read((events) => events.length > 0);
      const { post: made } = await post(camille, 'Un');
      await stream.read((events) => events.some((event) => event.event === 'post'));
      const [{ id: rightsId }] = await db
        .insert(minecraftServerEvent)
        .values({ topic: 'feed', type: 'rights', data: { uuids: [camille.uuid] } })
        .returning({ id: minecraftServerEvent.id });
      const last = await stream.read(
        (events) => events.at(-1)!.event === 'ping' && events.at(-1)!.id === String(rightsId),
        3000,
      );
      const ids = last.filter((event) => event.event === 'post').map((event) => event.id);
      expect(ids).toHaveLength(1);
      expect(JSON.parse(last.find((event) => event.event === 'post')!.data)).toMatchObject({
        id: made.id,
      });
      expect(last.map((event) => event.event)).not.toContain('rights');
    });

    it('resets for a Last-Event-ID that is not an event ID, and resumes from one that is', async () => {
      const camille = await person('Camille Roux');
      await post(camille, 'Un');
      const hub = quickHub();
      const holder = await openStream(streamOn(hub), camille);
      await holder.read((events) => events.length > 0);
      const latest = await latestEvent();
      const first = async (header: string) => {
        const stream = await openStream(streamOn(hub), camille, { 'last-event-id': header });
        const [opening] = await stream.read((events) => events.length > 0);
        stream.close();
        return `${opening!.event}:${opening!.id ?? '-'}`;
      };
      for (const bad of [
        'abc',
        '12abc',
        '-1',
        '1e3',
        '0x10',
        '4.2',
        'Infinity',
        '²',
        '99999999999999999999',
      ]) {
        expect(await first(bad), bad).toBe('reset:-');
      }
      // Above the newest, and from before the hub started: also reset.
      expect(await first(String(latest + 1))).toBe('reset:-');
      expect(await first('0')).toBe('reset:-');
      // The newest, with spaces around it, or none at all: a plain ping.
      expect(await first(String(latest))).toBe(`ping:${String(latest)}`);
      expect(await first(`  ${String(latest)}  `)).toBe(`ping:${String(latest)}`);
      expect(await first('')).toBe(`ping:${String(latest)}`);
    });

    it('answers 429 tooManyStreams with the caps reached, before any header, and frees a place on close', async () => {
      const camille = await person('Camille Roux');
      const mika = await person('Mika Laurent');
      const lea = await person('Léa Martin');
      const hub = quickHub({ total: 3, perUser: 2 });
      const kept = [
        await openStream(streamOn(hub), camille),
        await openStream(streamOn(hub), camille),
      ];
      const perUser = await openStream(streamOn(hub), camille);
      expect(perUser.error).toEqual({ statusCode: 429, data: { problem: 'tooManyStreams' } });
      expect(perUser.streaming).toBe(false);
      expect(perUser.headers.get('content-type')).toBeUndefined();
      const third = await openStream(streamOn(hub), mika);
      expect(third.status).toBe(200);
      const total = await openStream(streamOn(hub), lea);
      expect(total.error).toEqual({ statusCode: 429, data: { problem: 'tooManyStreams' } });
      expect(total.streaming).toBe(false);
      expect(hub.stats().connections).toBe(3);
      // The streams already open are untouched and go on.
      for (const stream of [...kept, third]) {
        expect((await stream.read((events) => events.length > 0))[0]!.event).toBe('ping');
      }
      third.close();
      expect((await openStream(streamOn(hub), lea)).status).toBe(200);
    });

    it('leaves nothing behind when the browser goes away', async () => {
      const camille = await person('Camille Roux');
      const streams = await Promise.all([1, 2, 3].map(() => openStream(getEvents, camille)));
      expect(feedLiveHub.stats().connections).toBe(3);
      for (const stream of streams) stream.close();
      expect(feedLiveHub.stats()).toMatchObject({ connections: 0, users: 0, running: false });
    });
  });

  describe('what the stream carries', () => {
    const PUBLIC = ['post', 'deleted', 'counts', 'pins'];

    it('is the same for every reader, the public rows of the topic as they are, and names no author', async () => {
      const mika = await person('Mika Laurent', { showRealName: true });
      const camille = await person('Camille Roux');
      const moderator = await person('Morgane Admin', { role: 'admin' });
      const hub = quickHub();
      const readers = await Promise.all(
        [camille, moderator, mika].map((who) => openStream(streamOn(hub), who)),
      );
      for (const reader of readers) await reader.read((events) => events.length > 0);

      // A busy minute: anonymous posts and replies, likes, pins, a deletion, a role.
      const texts = ['Secret de Mika', 'Réponse anonyme', 'Annonce cachée', 'Réponse publique'];
      const { post: hidden } = await post(mika, texts[0], { anonymous: true });
      const { post: answer } = await reply(camille, hidden.id, null, {
        anonymous: true,
        text: texts[1],
      });
      await api.like(camille, hidden.id);
      await api.unlike(camille, hidden.id);
      const { post: announcement } = await post(moderator, texts[2], {
        feed: 'announcements',
        anonymous: true,
      });
      await api.pin(moderator, announcement.id);
      await api.unpin(moderator, announcement.id);
      await reply(mika, hidden.id, answer.id, { text: texts[3] });
      await feedAnnouncerService.setFromAdmin({
        actorId: moderator.id,
        userId: camille.id,
        announcer: true,
      });
      await minecraftEventService.emit('feed', 'rights', { uuids: [mika.uuid] });
      await api.remove(mika, hidden.id);

      const rows = await db
        .select()
        .from(minecraftServerEvent)
        .where(eq(minecraftServerEvent.topic, 'feed'))
        .orderBy(asc(minecraftServerEvent.id));
      // The test is only worth something if the private events were really recorded.
      expect(rows.some((row) => row.type === 'rights')).toBe(true);
      expect(rows.some((row) => row.type === 'notification')).toBe(true);
      const expected = rows
        .filter((row) => PUBLIC.includes(row.type))
        .map((row) => ({ id: String(row.id), event: row.type, data: JSON.stringify(row.data) }));
      expect(expected.length).toBeGreaterThanOrEqual(8);

      const received = [];
      for (const reader of readers) {
        const events = await reader.read(
          (read) => read.filter((event) => event.event !== 'ping').length >= expected.length,
        );
        received.push(events.filter((event) => event.event !== 'ping'));
      }
      // Every reader got exactly the public rows, in order, with no extra and none per viewer.
      for (const events of received) expect(events).toEqual(expected);

      const wire = JSON.stringify(received[0]);
      for (const secret of [
        mika.uuid,
        mika.username,
        mika.id,
        camille.id,
        camille.uuid,
        camille.username,
        moderator.uuid,
        moderator.username,
        ...texts,
        'Mika',
        'Laurent',
        'author',
        'anonymous',
        'realName',
        'announcer',
        'mine',
        'liked',
        'canDelete',
        'canPin',
        'answersMe',
        'unseenReplies',
        'uuids',
        'text',
      ]) {
        expect(wire, secret).not.toContain(secret);
      }

      // And each event has exactly the fields the contract lists.
      const shapes: Record<string, (data: Record<string, unknown>) => unknown> = {
        post: (data) => Object.keys(data).sort(),
        deleted: (data) => [
          Object.keys(data),
          (data.items as object[]).map((i) => Object.keys(i).sort()),
        ],
        counts: (data) => [
          Object.keys(data),
          (data.items as object[]).map((i) => Object.keys(i).sort()),
        ],
        pins: (data) => [
          Object.keys(data),
          (data.pinned as object[]).map((i) => Object.keys(i).sort()),
        ],
      };
      for (const event of received[0]!) {
        const shape = shapes[event.event]!(JSON.parse(event.data) as Record<string, unknown>);
        const text = JSON.stringify(shape);
        if (event.event === 'post') expect(text).toBe('["createdAt","feed","id","threadId"]');
        if (event.event === 'deleted')
          expect(text).toBe(
            '[["items"],' +
              JSON.stringify(
                (JSON.parse(event.data) as { items: unknown[] }).items.map(() => [
                  'feed',
                  'id',
                  'threadId',
                ]),
              ) +
              ']',
          );
        if (event.event === 'counts') expect(text).toContain('["id","likes","replies"]');
        if (event.event === 'pins') expect(text.startsWith('[["pinned"]')).toBe(true);
      }
    });
  });
});
