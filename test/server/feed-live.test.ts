import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FEED_LIVE_LIMITS, createFeedLiveHub } from '~~/server/services/feed/live';
import type { FeedLiveLimits, FeedLiveMessage, FeedLiveSource } from '~~/server/services/feed/live';

// The browser stream's hub (docs/feed.md, "Live updates in the browser") with its own event
// source, flags and fake timers: one poll for every connection, the replay buffer and `reset`,
// the caps, the flag going off, a session ending, a client that stops reading, a database that
// is briefly away, and the loop starting with the first connection and stopping with the last.

interface Row {
  id: number;
  type: string;
  data: unknown;
}

/** minecraft_server_event's `feed` topic, in memory. */
function fakeSource(start = 10) {
  const rows: Row[] = [];
  let latest = start;
  const calls = { latestId: 0, since: 0 };
  let failing = 0;
  let gate: Promise<void> | null = null;
  const source: FeedLiveSource = {
    latestId: () => {
      calls.latestId++;
      if (failing > 0) {
        failing--;
        return Promise.reject(new Error('database away'));
      }
      return Promise.resolve(latest);
    },
    since: async (after, limit) => {
      calls.since++;
      if (gate) await gate;
      if (failing > 0) {
        failing--;
        throw new Error('database away');
      }
      return rows.filter((row) => row.id > after).slice(0, limit);
    },
  };
  return {
    source,
    calls,
    add(type: string, data: unknown = {}) {
      const row = { id: ++latest, type, data };
      rows.push(row);
      return row;
    },
    fail(times: number) {
      failing = times;
    },
    /** Holds every read until the returned function is called. */
    hold() {
      let open!: () => void;
      gate = new Promise((resolve) => {
        open = () => {
          gate = null;
          resolve();
        };
      });
      return open;
    },
  };
}

function fakeSink() {
  const state = { messages: [] as FeedLiveMessage[], buffered: 0, closed: false };
  return {
    state,
    sink: {
      send: (message: FeedLiveMessage) => {
        state.messages.push(message);
      },
      buffered: () => state.buffered,
      close: () => {
        state.closed = true;
      },
    },
    /** The events received, ignoring pings. */
    events: () => state.messages.filter((message) => message.event !== 'ping'),
    pings: () => state.messages.filter((message) => message.event === 'ping').length,
  };
}

const post = (id: string) => ({
  id,
  feed: 'global',
  threadId: null,
  createdAt: '2026-11-23T20:14:05.000Z',
});

describe('the Feed live hub', () => {
  let db: ReturnType<typeof fakeSource>;
  let enabled: boolean;
  let log: ReturnType<typeof vi.fn<(message: string, error: unknown) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    db = fakeSource();
    enabled = true;
    log = vi.fn<(message: string, error: unknown) => void>();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function hub(limits: Partial<FeedLiveLimits> = {}) {
    return createFeedLiveHub(
      {
        source: db.source,
        enabled: () => Promise.resolve(enabled),
        log,
      },
      { ...FEED_LIVE_LIMITS, ...limits },
    );
  }

  function connect(
    live: ReturnType<typeof hub>,
    options: { user?: string; last?: number | null; alive?: () => Promise<boolean> } = {},
  ) {
    const client = fakeSink();
    const leave = live.join({
      userId: options.user ?? 'u1',
      lastEventId: options.last ?? null,
      sink: client.sink,
      sessionAlive: options.alive ?? (() => Promise.resolve(true)),
    });
    return { ...client, leave };
  }

  const tick = (ms = FEED_LIVE_LIMITS.pollMs) => vi.advanceTimersByTimeAsync(ms);

  it('reads nothing while nobody is connected, and starts from the newest event', async () => {
    const live = hub();
    db.add('post', post('old'));
    await tick(5000);
    expect(db.calls).toEqual({ latestId: 0, since: 0 });
    expect(vi.getTimerCount()).toBe(0);

    const a = connect(live);
    await tick(0);
    expect(db.calls.latestId).toBe(1);
    expect(live.stats()).toMatchObject({ connections: 1, running: true, cursor: 11 });
    // The event from before the connection isn't sent; a ping opens the response.
    expect(a.events()).toEqual([]);
    expect(a.pings()).toBe(1);
  });

  it('polls once a second for every connection together, and pushes each event to all', async () => {
    const live = hub();
    const clients = [connect(live, { user: 'u1' }), connect(live, { user: 'u2' }), connect(live)];
    await tick(0);
    const before = db.calls.since;
    await tick(3000);
    // One read per second, whatever the number of tabs.
    expect(db.calls.since - before).toBe(3);

    const row = db.add('post', post('p1'));
    await tick();
    for (const client of clients) {
      expect(client.events()).toEqual([
        { id: String(row.id), event: 'post', data: JSON.stringify(row.data) },
      ]);
    }
    expect(db.calls.latestId).toBe(1);
  });

  it('sends the four public types with their data, and never rights or notification', async () => {
    const live = hub();
    const a = connect(live);
    await tick(0);
    db.add('post', post('p1'));
    db.add('rights', { uuids: ['5c2a7a3e-6b1d-3c8e-9f4a-2d7b8c9e0f11'] });
    db.add('deleted', { items: [{ id: 'p1', feed: 'global', threadId: null }] });
    db.add('notification', {});
    db.add('counts', { items: [{ id: 'p2', likes: 3, replies: 1 }] });
    db.add('pins', { pinned: [{ id: 'p3', pinnedAt: '2026-11-23T20:14:05.000Z' }] });
    db.add('something-new', { secret: true });
    await tick();
    expect(a.events().map((message) => message.event)).toEqual([
      'post',
      'deleted',
      'counts',
      'pins',
    ]);
    expect(a.events().map((message) => JSON.parse(message.data) as unknown)).toEqual([
      post('p1'),
      { items: [{ id: 'p1', feed: 'global', threadId: null }] },
      { items: [{ id: 'p2', likes: 3, replies: 1 }] },
      { pinned: [{ id: 'p3', pinnedAt: '2026-11-23T20:14:05.000Z' }] },
    ]);
    expect(a.events().map((message) => Number(message.id))).toEqual([11, 13, 15, 16]);
  });

  it('replays what a reconnecting tab missed after its Last-Event-ID, then goes live', async () => {
    const live = hub();
    const a = connect(live);
    await tick(0);
    const first = db.add('post', post('p1'));
    db.add('notification', {});
    const second = db.add('counts', { items: [] });
    const third = db.add('pins', { pinned: [] });
    await tick();

    const b = connect(live, { last: first.id });
    expect(b.state.messages.map((message) => message.id)).toEqual([
      String(second.id),
      String(third.id),
    ]);
    const fourth = db.add('post', post('p2'));
    await tick();
    expect(b.events().map((message) => message.id)).toEqual(
      [second, third, fourth].map((row) => String(row.id)),
    );
    expect(a.events()).toHaveLength(4);
  });

  it('answers the newest ID with nothing to replay, only the opening ping', async () => {
    const live = hub();
    connect(live);
    await tick(0);
    const row = db.add('post', post('p1'));
    await tick();
    const b = connect(live, { last: row.id });
    expect(b.state.messages).toEqual([{ id: String(row.id), event: 'ping', data: '{}' }]);
  });

  it('sends reset for an ID older than the buffer, unknown, or from the future', async () => {
    const live = hub({ buffer: 3 });
    connect(live);
    await tick(0);
    const rows = [1, 2, 3, 4, 5].map((n) => db.add('post', post(`p${String(n)}`)));
    await tick();
    // The ring kept the last three: replay works from the one before them on.
    const kept = connect(live, { last: rows[1]!.id });
    expect(kept.state.messages.map((message) => message.id)).toEqual(
      [rows[2], rows[3], rows[4]].map((row) => String(row!.id)),
    );
    const dropped = connect(live, { last: rows[0]!.id });
    expect(dropped.state.messages).toEqual([{ event: 'reset', data: '{}' }]);
    // Before the hub started (10 was the newest then), or not an ID at all.
    expect(connect(live, { last: 9, user: 'u2' }).state.messages[0]!.event).toBe('reset');
    expect(connect(live, { last: -1, user: 'u2' }).state.messages[0]!.event).toBe('reset');
    expect(connect(live, { last: 999, user: 'u2' }).state.messages[0]!.event).toBe('reset');
  });

  it('gives pings the last ID read, so a tab that saw no event yet loses nothing', async () => {
    const live = hub();
    const a = connect(live);
    connect(live, { user: 'u2' });
    await tick(0);
    db.add('notification', {});
    await tick(25_000);
    const last = a.state.messages.at(-1)!;
    expect(last).toEqual({ id: '11', event: 'ping', data: '{}' });
    // The tab drops (a proxy's timeout) while another keeps the hub running.
    a.leave();
    const missed = db.add('post', post('p1'));
    await tick();
    const back = connect(live, { last: Number(last.id) });
    expect(back.events().map((message) => message.id)).toEqual([String(missed.id)]);
  });

  it('decides replay or reset once it knows where it stands, for tabs that came first', async () => {
    const live = hub();
    const early = connect(live, { last: 3 });
    const current = connect(live, { last: 10, user: 'u2' });
    expect(early.state.messages).toEqual([]);
    await tick(0);
    expect(early.state.messages).toEqual([{ event: 'reset', data: '{}' }]);
    expect(current.state.messages).toEqual([{ id: '10', event: 'ping', data: '{}' }]);
  });

  it('closes an account’s oldest stream for its sixth, and refuses one past the total', () => {
    const live = hub({ total: 7 });
    const mine = Array.from({ length: 5 }, () => connect(live));
    const sixth = connect(live);
    expect(mine[0]!.state.closed).toBe(true);
    expect(sixth.state.closed).toBe(false);
    connect(live, { user: 'u2' });
    connect(live, { user: 'u3' });
    const refusal = (() => {
      try {
        connect(live, { user: 'u4' });
      } catch (error) {
        return error as { statusCode: number; data: unknown };
      }
      return null;
    })();
    expect(refusal).toMatchObject({ statusCode: 429, data: { problem: 'tooManyStreams' } });
    // At the total, an account at its own cap still replaces its oldest.
    expect(() => connect(live)).not.toThrow();
    expect(mine[1]!.state.closed).toBe(true);
    // A tab that closes frees its place.
    mine[2]!.leave();
    expect(() => connect(live, { user: 'u4' })).not.toThrow();
    expect(live.stats().connections).toBe(7);
  });

  it('closes every stream when the flag goes off, and stops', async () => {
    const live = hub();
    const clients = [connect(live), connect(live, { user: 'u2' })];
    await tick(0);
    enabled = false;
    await tick();
    for (const client of clients) expect(client.state.closed).toBe(true);
    expect(live.stats()).toMatchObject({ connections: 0, running: false, buffered: 0 });
    expect(vi.getTimerCount()).toBe(0);
    const reads = db.calls.since;
    await tick(5000);
    expect(db.calls.since).toBe(reads);
  });

  it('closes every stream when the flag goes off, even while a read hangs', async () => {
    const live = hub();
    const a = connect(live);
    await tick(0);
    db.hold();
    await tick();
    enabled = false;
    await tick();
    expect(a.state.closed).toBe(true);
    expect(live.stats()).toMatchObject({ connections: 0, running: false });
  });

  it('gives up a read that never ends: the tabs get reset, and events flow again', async () => {
    const live = hub();
    const a = connect(live);
    const b = connect(live, { user: 'u2' });
    await tick(0);
    // The next read never answers, as on a pool connection stuck on a dead socket.
    const since = db.source.since.bind(db.source);
    let stuck = true;
    db.source.since = (after, limit) => {
      if (stuck) {
        stuck = false;
        return new Promise(() => {});
      }
      return since(after, limit);
    };
    await tick();
    const missed = db.add('post', post('p1'));
    await tick(29_000);
    expect(a.events()).toEqual([]);
    await tick(1000);
    for (const client of [a, b]) {
      expect(client.events()).toEqual([{ event: 'reset', data: '{}' }]);
      expect(client.state.closed).toBe(false);
    }
    expect(log).toHaveBeenCalledTimes(1);
    // A new loop, from the newest event: the missed post is the page's to read again on reset.
    await tick();
    expect(live.stats()).toMatchObject({ connections: 2, running: true, cursor: missed.id });
    const next = db.add('post', post('p2'));
    await tick();
    for (const client of [a, b]) {
      expect(client.events().map((message) => message.id)).toEqual([undefined, String(next.id)]);
    }
    expect(vi.getTimerCount()).toBe(1);
  });

  it('sends one reset for a stuck spell, however many reads it gives up', async () => {
    const live = hub();
    const a = connect(live);
    await tick(0);
    db.source.since = () => new Promise(() => {});
    db.source.latestId = () => new Promise(() => {});
    await tick(95_000);
    expect(a.events()).toEqual([{ event: 'reset', data: '{}' }]);
    expect(a.state.closed).toBe(false);
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('pings after 25 quiet seconds, and checks the session then and every minute', async () => {
    const live = hub();
    const alive = vi.fn(() => Promise.resolve(true));
    const a = connect(live, { alive });
    await tick(0);
    expect(a.pings()).toBe(1);
    await tick(24_000);
    expect(a.pings()).toBe(1);
    await tick(1000);
    expect(a.pings()).toBe(2);
    expect(alive).toHaveBeenCalledTimes(1);
    // Events keep it busy: no ping, but the session is still checked every minute.
    for (let second = 0; second < 70; second++) {
      db.add('counts', { items: [] });
      await tick();
    }
    expect(a.pings()).toBe(2);
    expect(alive).toHaveBeenCalledTimes(2);
    expect(a.state.closed).toBe(false);
  });

  it('closes a stream whose session is gone, and keeps it when the check fails', async () => {
    const live = hub();
    let answer: () => Promise<boolean> = () => Promise.reject(new Error('database away'));
    const a = connect(live, { alive: () => answer() });
    const b = connect(live, { user: 'u2' });
    await tick(0);
    await tick(25_000);
    expect(a.state.closed).toBe(false);
    answer = () => Promise.resolve(false);
    await tick(25_000);
    expect(a.state.closed).toBe(true);
    expect(b.state.closed).toBe(false);
    expect(live.stats().connections).toBe(1);
  });

  it('closes a client that stopped reading, and only that one', async () => {
    const live = hub();
    const stalled = connect(live);
    const healthy = connect(live, { user: 'u2' });
    await tick(0);
    stalled.state.buffered = FEED_LIVE_LIMITS.maxBuffered + 1;
    db.add('post', post('p1'));
    await tick();
    expect(stalled.state.closed).toBe(true);
    expect(stalled.events()).toEqual([]);
    expect(healthy.events()).toHaveLength(1);
    expect(live.stats().connections).toBe(1);
  });

  it('notices a stalled client even when nothing is sent', async () => {
    const live = hub();
    const stalled = connect(live);
    await tick(0);
    stalled.state.buffered = FEED_LIVE_LIMITS.maxBuffered + 1;
    await tick();
    expect(stalled.state.closed).toBe(true);
    expect(live.stats().running).toBe(false);
  });

  it('stops with the last tab, forgets its buffer, and starts again from the newest', async () => {
    const live = hub();
    const a = connect(live);
    await tick(0);
    const seen = db.add('post', post('p1'));
    await tick();
    a.leave();
    a.leave();
    expect(live.stats()).toEqual({
      connections: 0,
      users: 0,
      running: false,
      buffered: 0,
      cursor: null,
    });
    expect(vi.getTimerCount()).toBe(0);

    db.add('post', post('p2'));
    await tick(5000);
    const b = connect(live, { last: seen.id });
    await tick(0);
    expect(db.calls.latestId).toBe(2);
    // What happened while nobody watched can't be replayed: the page reloads.
    expect(b.state.messages).toEqual([{ event: 'reset', data: '{}' }]);
    const fresh = connect(live, { user: 'u2' });
    expect(fresh.state.messages).toEqual([{ id: '12', event: 'ping', data: '{}' }]);
  });

  it('keeps the streams open while the database is away, and loses nothing', async () => {
    const live = hub();
    const a = connect(live);
    await tick(0);
    db.fail(30);
    const row = db.add('post', post('p1'));
    await tick(30_000);
    expect(a.state.closed).toBe(false);
    expect(a.pings()).toBeGreaterThan(1);
    expect(log).toHaveBeenCalledTimes(1);
    await tick(2000);
    expect(a.events().map((message) => message.id)).toEqual([String(row.id)]);
  });

  it('waits for the first read when the database is away at the start', async () => {
    const live = hub();
    db.fail(2);
    const a = connect(live);
    await tick(0);
    await tick();
    expect(a.state.messages).toEqual([]);
    await tick();
    expect(a.pings()).toBe(1);
  });

  it('drops a read that was running when the last tab left', async () => {
    const live = hub();
    const a = connect(live);
    await tick(0);
    const open = db.hold();
    await tick();
    a.leave();
    db.add('post', post('p1'));
    const b = connect(live);
    open();
    await tick(0);
    await tick();
    // Started again from the newest: the event from before b doesn't reach it.
    expect(b.events()).toEqual([]);
    expect(live.stats().cursor).toBe(11);
    expect(live.stats().buffered).toBe(0);
  });

  it('runs one read at a time, even when one is slow', async () => {
    const live = hub();
    connect(live);
    await tick(0);
    const before = db.calls.since;
    const open = db.hold();
    await tick(5000);
    expect(db.calls.since - before).toBe(1);
    open();
    await tick();
    expect(db.calls.since - before).toBe(2);
  });

  it('catches up in pages after a burst', async () => {
    const live = hub({ page: 2 });
    const a = connect(live);
    await tick(0);
    for (let n = 0; n < 7; n++) db.add('counts', { items: [] });
    await tick();
    expect(a.events()).toHaveLength(7);
  });

  it('closes everything on demand', async () => {
    const live = hub();
    const clients = [connect(live), connect(live)];
    await tick(0);
    live.closeAll();
    for (const client of clients) expect(client.state.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
