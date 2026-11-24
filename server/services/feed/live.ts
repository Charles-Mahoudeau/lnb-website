import { flagService } from '~~/server/services/flags';
import { minecraftEventService } from '~~/server/services/minecraft-events';

import { refuse } from './shared';

// The browser's live stream (docs/feed.md, "Live updates in the browser"): one in-process hub for
// every open tab, since the site is one container without Redis. While at least one connection is
// open, it polls the `feed` topic of minecraft_server_event once a second, keeps the four public
// event types in a ring buffer, and pushes each new one to every connection. It never sends
// `rights` or `notification`, and nothing per viewer: the page asks `GET /api/feed/views` for its
// own view of a new post.

export const FEED_LIVE_LIMITS = {
  /** How often the hub reads new events, and looks after its connections. */
  pollMs: 1000,
  /** A `ping` after this long without a message, so proxies keep the connection open. */
  pingMs: 25_000,
  /** How often a connection checks that its session still exists (also at each ping). */
  sessionMs: 60_000,
  /** The public events kept for `Last-Event-ID` replay. */
  buffer: 500,
  /** Open streams per account, and in all. */
  perUser: 5,
  total: 500,
  /**
   * Bytes a connection may leave unread before it is closed: a client that stopped reading (a
   * sleeping laptop, a dead network) would otherwise make Node buffer every event for it.
   */
  maxBuffered: 64 * 1024,
  /** Rows read per query, and queries per poll at most, to catch up after a pause. */
  page: 500,
  pagesPerPoll: 10,
  /**
   * A read of the database that hasn't ended after this long is given up: the loop starts again
   * from the newest event and the tabs are told to `reset`.
   */
  readTimeoutMs: 30_000,
};

export type FeedLiveLimits = typeof FEED_LIVE_LIMITS;

/** The types the browser may see: the same data as the server's stream. */
export const FEED_LIVE_TYPES: ReadonlySet<string> = new Set(['post', 'deleted', 'counts', 'pins']);

export interface FeedLiveMessage {
  id?: string;
  event: string;
  data: string;
}

/** One open response, as the hub sees it. */
export interface FeedLiveSink {
  /** Writes one message without waiting for the client. */
  send(message: FeedLiveMessage): void;
  /** Bytes written that the client hasn't taken yet. */
  buffered(): number;
  close(): void;
}

export interface FeedLiveSource {
  latestId(): Promise<number>;
  since(afterId: number, limit: number): Promise<{ id: number; type: string; data: unknown }[]>;
}

export interface FeedLiveDeps {
  source: FeedLiveSource;
  /** Whether `feed` and `feed.live` are on. */
  enabled(): Promise<boolean>;
  now?: () => number;
  log?: (message: string, error: unknown) => void;
}

export interface FeedLiveJoin {
  userId: string;
  /** The `Last-Event-ID` sent: null without one, -1 for one that isn't an event ID. */
  lastEventId: number | null;
  sink: FeedLiveSink;
  /** Whether the connection's session still exists. A failure to tell keeps it open. */
  sessionAlive(): Promise<boolean>;
}

interface Connection {
  userId: string;
  sink: FeedLiveSink;
  sessionAlive(): Promise<boolean>;
  lastEventId: number | null;
  /** Welcomed: replayed (or reset) and taking new events. */
  ready: boolean;
  closed: boolean;
  lastPush: number;
  lastCheck: number;
  checking: boolean;
}

interface Buffered extends FeedLiveMessage {
  seq: number;
}

const RESET: FeedLiveMessage = { event: 'reset', data: '{}' };
/** Sent to an account's oldest stream before it is closed for a newer one of the account. */
const REPLACED: FeedLiveMessage = { event: 'closed', data: '{"problem":"tooManyStreams"}' };

/**
 * A hub with its own source, flags and clock, so tests can drive it. The site uses one,
 * `feedLiveHub`, below.
 */
export function createFeedLiveHub(deps: FeedLiveDeps, limits: FeedLiveLimits = FEED_LIVE_LIMITS) {
  const now = deps.now ?? (() => Date.now());
  const log =
    deps.log ??
    ((message: string, error: unknown) => {
      console.error(message, error);
    });
  const connections = new Set<Connection>();
  const perUser = new Map<string, number>();

  // Bumped at each start and stop, so a poll still running from before drops what it read.
  let generation = 0;
  let running = false;
  let polling = false;
  let checkingFlags = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The last event ID read, null until the poll loop has started. */
  let cursor: number | null = null;
  /** Every public event after this ID is in the ring. */
  let floor = 0;
  let ring: Buffered[] = [];
  let failures = 0;
  /** When the read in flight started. */
  let readStartedAt = 0;
  /** A read ended since the last one given up: the tabs get one `reset` per stuck spell. */
  let readSinceGiveUp = true;

  /**
   * A ping carries the last event ID read: the tab has every public event up to it, so a tab
   * that saw no event yet still reconnects with a Last-Event-ID and misses nothing.
   */
  function ping(): FeedLiveMessage {
    return { ...(cursor === null ? {} : { id: String(cursor) }), event: 'ping', data: '{}' };
  }

  /** Pushes one message, unless the client stopped reading. False when it wasn't sent. */
  function send(conn: Connection, message: FeedLiveMessage): boolean {
    if (conn.closed) return false;
    if (conn.sink.buffered() > limits.maxBuffered) {
      kick(conn);
      return false;
    }
    try {
      conn.sink.send(message);
      conn.lastPush = now();
      return true;
    } catch {
      kick(conn);
      return false;
    }
  }

  /** Closes a connection from the hub's side. */
  function kick(conn: Connection) {
    if (conn.closed) return;
    try {
      conn.sink.close();
    } catch {
      // Already gone.
    }
    drop(conn);
  }

  /** Forgets a connection, closed by either side. The loop stops with the last one. */
  function drop(conn: Connection) {
    if (conn.closed) return;
    conn.closed = true;
    connections.delete(conn);
    const count = (perUser.get(conn.userId) ?? 1) - 1;
    if (count > 0) perUser.set(conn.userId, count);
    else perUser.delete(conn.userId);
    if (!connections.size) stop();
  }

  function stop() {
    generation++;
    clearTimeout(timer);
    timer = undefined;
    running = false;
    polling = false;
    checkingFlags = false;
    cursor = null;
    floor = 0;
    ring = [];
    failures = 0;
    readSinceGiveUp = true;
  }

  function start() {
    if (running) return;
    running = true;
    schedule(++generation, 0);
  }

  function schedule(gen: number, delay: number) {
    timer = setTimeout(() => {
      wake(gen);
    }, delay);
  }

  /** Each tick: look after the connections, then read new events unless a read is running. */
  function wake(gen: number) {
    if (gen !== generation) return;
    if (polling && now() - readStartedAt >= limits.readTimeoutMs) {
      giveUpRead();
      return;
    }
    schedule(gen, limits.pollMs);
    tend();
    // tend() may have dropped the last connection, which stopped this loop.
    if (gen !== generation) return;
    if (!polling) void poll(gen);
    // A read that hangs doesn't hold the flags back: they are read on the side meanwhile.
    else if (!checkingFlags) void checkFlags(gen);
  }

  /**
   * Gives up a read that never ended (a pool connection stuck on a dead socket, which no error
   * ever ends): a new loop, its own generation, starts from the newest event, so the stuck read
   * drops whatever it may still bring back, and the tabs, kept open, get `reset` to read
   * themselves again for what was missed meanwhile.
   */
  function giveUpRead() {
    log(
      'The Feed live stream gave up a read of new events that did not end',
      new Error(`No answer in ${String(limits.readTimeoutMs)} ms`),
    );
    generation++;
    clearTimeout(timer);
    polling = false;
    checkingFlags = false;
    cursor = null;
    floor = 0;
    ring = [];
    failures = 0;
    if (readSinceGiveUp) {
      readSinceGiveUp = false;
      for (const conn of [...connections]) if (conn.ready) send(conn, RESET);
    }
    // Sending may have dropped the last connection, which stopped the hub.
    if (running && connections.size) schedule(generation, 0);
  }

  /** Closes every connection when `feed` or `feed.live` is off. */
  async function checkFlags(gen: number) {
    checkingFlags = true;
    try {
      if (!(await deps.enabled()) && gen === generation) {
        for (const conn of [...connections]) kick(conn);
      }
    } catch {
      // The flags can't be read either: the next tick tries again.
    } finally {
      if (gen === generation) checkingFlags = false;
    }
  }

  /** Pings, session checks and stalled clients. */
  function tend() {
    const at = now();
    for (const conn of [...connections]) {
      if (!conn.ready) continue;
      if (conn.sink.buffered() > limits.maxBuffered) {
        kick(conn);
        continue;
      }
      if (at - conn.lastPush >= limits.pingMs) {
        send(conn, ping());
        check(conn, at);
      } else if (at - conn.lastCheck >= limits.sessionMs) {
        check(conn, at);
      }
    }
  }

  function check(conn: Connection, at: number) {
    if (conn.checking || conn.closed) return;
    conn.checking = true;
    conn.lastCheck = at;
    conn
      .sessionAlive()
      .then(
        (alive) => {
          if (!alive) kick(conn);
        },
        // The database may be briefly away: nobody is signed out for that.
        () => {},
      )
      .finally(() => {
        conn.checking = false;
      });
  }

  async function poll(gen: number) {
    polling = true;
    readStartedAt = now();
    try {
      if (!(await deps.enabled())) {
        if (gen === generation) for (const conn of [...connections]) kick(conn);
        return;
      }
      if (gen !== generation) return;
      if (cursor === null) {
        const latest = await deps.source.latestId();
        if (gen !== generation) return;
        cursor = latest;
        floor = latest;
        for (const conn of [...connections]) if (!conn.ready) welcome(conn);
        // A welcome may have dropped the only connection, which stopped this loop.
        if (gen !== generation) return;
      }
      for (let page = 0; page < limits.pagesPerPoll; page++) {
        const rows = await deps.source.since(cursor, limits.page);
        for (const row of rows) {
          // Sending may drop the last connection, which stops this loop: read nothing more.
          if (gen !== generation) return;
          take(row);
        }
        if (gen !== generation) return;
        if (rows.length < limits.page) break;
      }
      failures = 0;
      readSinceGiveUp = true;
    } catch (error) {
      // A read from a loop that was stopped since says nothing about the current one.
      if (gen !== generation) return;
      // Logged once per outage, then every minute or so: the loop keeps trying each second.
      if (failures++ % 60 === 0) log('The Feed live stream could not read new events', error);
    } finally {
      if (gen === generation) polling = false;
    }
  }

  /** One new row of the topic: kept and pushed when public. Same tick, same order for all. */
  function take(row: { id: number; type: string; data: unknown }) {
    cursor = row.id;
    if (!FEED_LIVE_TYPES.has(row.type)) return;
    const message: Buffered = {
      seq: row.id,
      id: String(row.id),
      event: row.type,
      data: JSON.stringify(row.data),
    };
    ring.push(message);
    if (ring.length > limits.buffer) floor = ring.shift()!.seq;
    for (const conn of [...connections]) {
      if (conn.ready) send(conn, { id: message.id, event: message.event, data: message.data });
    }
  }

  /** A new connection, once the hub knows where it stands: replay, or `reset`, then live. */
  function welcome(conn: Connection) {
    const last = conn.lastEventId;
    let sent = false;
    if (last !== null && cursor !== null) {
      if (last < floor || last > cursor) {
        sent = send(conn, RESET);
      } else {
        for (const message of ring) {
          if (message.seq > last) {
            sent = send(conn, { id: message.id, event: message.event, data: message.data });
          }
        }
      }
    }
    // Something at once, so the response starts and the client knows it is open.
    if (!sent) send(conn, ping());
    conn.ready = !conn.closed;
  }

  /**
   * Opens a connection. An account at its cap gets its oldest stream closed to make room (one a
   * client left without closing, a laptop asleep or a network change, would otherwise hold its
   * place until TCP gives up); past the total cap, 429 `tooManyStreams`, before anything is sent.
   * Returns the function to call when the response closes.
   */
  function join(input: FeedLiveJoin): () => void {
    if ((perUser.get(input.userId) ?? 0) >= limits.perUser) {
      const oldest = [...connections].find((conn) => conn.userId === input.userId);
      if (oldest) {
        send(oldest, REPLACED);
        kick(oldest);
      }
    } else if (connections.size >= limits.total) {
      refuse(429, 'tooManyStreams');
    }
    const at = now();
    const conn: Connection = {
      userId: input.userId,
      sink: input.sink,
      sessionAlive: () => input.sessionAlive(),
      lastEventId: input.lastEventId,
      ready: false,
      closed: false,
      lastPush: at,
      lastCheck: at,
      checking: false,
    };
    connections.add(conn);
    perUser.set(input.userId, (perUser.get(input.userId) ?? 0) + 1);
    // A running loop welcomes it now, or at its first read when it hasn't read yet.
    if (!running) start();
    else if (cursor !== null) welcome(conn);
    return () => {
      drop(conn);
    };
  }

  /** What the hub holds, for tests and checks. */
  function stats() {
    return {
      connections: connections.size,
      users: perUser.size,
      running,
      buffered: ring.length,
      cursor,
    };
  }

  /** Closes every connection (the hub then stops). */
  function closeAll() {
    for (const conn of [...connections]) kick(conn);
  }

  return { join, stats, closeAll };
}

export type FeedLiveHub = ReturnType<typeof createFeedLiveHub>;

export const feedLiveHub = createFeedLiveHub({
  source: {
    latestId: () => minecraftEventService.latestId('feed'),
    since: (afterId, limit) => minecraftEventService.since('feed', afterId, limit),
  },
  enabled: async () =>
    (await flagService.isEnabled('feed')) && (await flagService.isEnabled('feed.live')),
});
