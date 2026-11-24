import { vi } from 'vitest';

import { FEED_LIVE_LIMITS, createFeedLiveHub } from '~~/server/services/feed/live';
import type { FeedLiveLimits, FeedLiveMessage, FeedLiveSource } from '~~/server/services/feed/live';

// Fakes for the tests of the browser stream's hub (feed-live-hub*.test.ts): the `feed` topic of
// minecraft_server_event in memory, with reads that can be held, failed or answered late, a flag
// that can be held too, and connections whose sink can stall or break.

export interface Row {
  id: number;
  type: string;
  data: unknown;
}

type Gate = { promise: Promise<void>; open: () => void; fail: (error: Error) => void };

function gate(): Gate {
  let open!: () => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    open = resolve;
    fail = reject;
  });
  // A gate nobody awaits any more must not be reported as unhandled.
  promise.catch(() => {});
  return { promise, open, fail };
}

/**
 * The topic in memory. A read answers with what the topic held when it was *called*, however late
 * it comes back, as a database does: that is what makes a read that outlives its poll loop stale.
 */
export function fakeSource(start = 10) {
  const rows: Row[] = [];
  let latest = start;
  const calls = { latestId: 0, since: 0 };
  let failing = 0;
  /** Fail the nth `since` call from now (1 is the next), once. */
  let failSinceAt = 0;
  let sinceGate: Gate | null = null;
  let latestGate: Gate | null = null;
  /** Whether the gate holds the next call only, instead of every call until it is opened. */
  let sinceOnce = false;
  let latestOnce = false;
  const source: FeedLiveSource = {
    latestId: async () => {
      calls.latestId++;
      const value = latest;
      const held = latestGate;
      if (latestOnce) latestGate = null;
      if (failing > 0) {
        failing--;
        throw new Error('database away');
      }
      if (held) await held.promise;
      return value;
    },
    since: async (after, limit) => {
      calls.since++;
      if (failSinceAt > 0 && --failSinceAt === 0) throw new Error('database dropped a read');
      const found = rows.filter((row) => row.id > after).slice(0, limit);
      const held = sinceGate;
      if (sinceOnce) sinceGate = null;
      if (failing > 0) {
        failing--;
        throw new Error('database away');
      }
      if (held) await held.promise;
      return found;
    },
  };
  return {
    source,
    calls,
    rows,
    get latest() {
      return latest;
    },
    add(type: string, data: unknown = {}) {
      const row = { id: ++latest, type, data };
      rows.push(row);
      return row;
    },
    /** The next `times` reads, of either kind, fail. */
    fail(times: number) {
      failing = times;
    },
    /** The `n`th `since` call from now fails (once). */
    failSinceAt(n: number) {
      failSinceAt = n;
    },
    /** Holds every `since` call made from now until the returned handle is used. */
    holdSince(onlyNext = false) {
      const held = gate();
      sinceGate = held;
      sinceOnce = onlyNext;
      return {
        open: () => {
          if (sinceGate === held) sinceGate = null;
          held.open();
        },
        fail: (error = new Error('database dropped a read')) => {
          if (sinceGate === held) sinceGate = null;
          held.fail(error);
        },
      };
    },
    holdLatest(onlyNext = false) {
      const held = gate();
      latestGate = held;
      latestOnce = onlyNext;
      return {
        open: () => {
          if (latestGate === held) latestGate = null;
          held.open();
        },
        fail: (error = new Error('database dropped a read')) => {
          if (latestGate === held) latestGate = null;
          held.fail(error);
        },
      };
    },
  };
}

export function fakeSink() {
  const state = {
    messages: [] as FeedLiveMessage[],
    buffered: 0,
    closed: false,
    closes: 0,
    sendThrows: false,
    closeThrows: false,
  };
  return {
    state,
    sink: {
      send: (message: FeedLiveMessage) => {
        if (state.sendThrows) throw new Error('socket gone');
        state.messages.push(message);
      },
      buffered: () => state.buffered,
      close: () => {
        state.closed = true;
        state.closes++;
        if (state.closeThrows) throw new Error('already gone');
      },
    },
    /** The events received, pings left out. */
    events: () => state.messages.filter((message) => message.event !== 'ping'),
    ids: () => state.messages.filter((m) => m.event !== 'ping').map((message) => message.id),
    pings: () => state.messages.filter((message) => message.event === 'ping'),
  };
}

export const post = (id: string) => ({
  id,
  feed: 'global',
  threadId: null,
  createdAt: '2026-11-23T20:14:05.000Z',
});

/** The flag of the hub (`feed` and `feed.live`), which a test can switch, hold or break. */
export function fakeFlag() {
  const state = { on: true, fails: false, calls: 0, held: null as Gate | null };
  return {
    state,
    enabled: async () => {
      state.calls++;
      const value = state.on;
      if (state.fails) throw new Error('flags unreadable');
      if (state.held) await state.held.promise;
      return value;
    },
    hold() {
      const held = gate();
      state.held = held;
      return () => {
        state.held = null;
        held.open();
      };
    },
  };
}

/** A hub on fake sources, with its connections made easy. */
export function hubRig(start = 10) {
  const db = fakeSource(start);
  const flag = fakeFlag();
  const log = vi.fn<(message: string, error: unknown) => void>();
  const rig = {
    db,
    flag,
    log,
    hub(limits: Partial<FeedLiveLimits> = {}) {
      return createFeedLiveHub(
        { source: db.source, enabled: flag.enabled, log },
        { ...FEED_LIVE_LIMITS, ...limits },
      );
    },
  };
  return rig;
}

export type Hub = ReturnType<ReturnType<typeof hubRig>['hub']>;

export function connect(
  live: Hub,
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

/** Whether `join` refuses, and with what. */
export function refusedJoin(live: Hub, user: string) {
  const client = fakeSink();
  try {
    live.join({
      userId: user,
      lastEventId: null,
      sink: client.sink,
      sessionAlive: () => Promise.resolve(true),
    });
  } catch (error) {
    return { error: error as { statusCode: number; data: unknown }, client };
  }
  return { error: null, client };
}

export const tick = (ms: number = FEED_LIVE_LIMITS.pollMs) => vi.advanceTimersByTimeAsync(ms);
