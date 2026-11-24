import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { connect, hubRig, post, tick } from './feed-live-hub-helpers';

// The hub's poller across starts, stops and slow or failing reads, and the database being away
// (docs/feed.md, "One poller for every tab" and "As built"): a read that outlives its loop is
// dropped, one read runs at a time, a restart is clean, and an outage loses nothing the ring holds.

describe('the Feed live hub, poller lifecycle', () => {
  let rig: ReturnType<typeof hubRig>;
  beforeEach(() => {
    vi.useFakeTimers();
    rig = hubRig();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('starts and stops', () => {
    it('reads nothing at all for connections that come and go within one tick', async () => {
      const live = rig.hub();
      for (let n = 0; n < 50; n++) {
        const a = connect(live, { user: `u${String(n)}` });
        expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
        a.leave();
        expect(vi.getTimerCount()).toBe(0);
      }
      await tick(10_000);
      expect(rig.db.calls).toEqual({ latestId: 0, since: 0 });
      expect(rig.flag.state.calls).toBe(0);
      expect(live.stats()).toMatchObject({ connections: 0, running: false, cursor: null });
    });

    it('never holds more than one timer, however many tabs and cycles', async () => {
      const live = rig.hub();
      const clients = Array.from({ length: 20 }, (_, n) =>
        connect(live, { user: `u${String(n)}` }),
      );
      await tick(0);
      expect(vi.getTimerCount()).toBe(1);
      for (let n = 0; n < 5; n++) {
        for (const client of clients.splice(0, 10)) client.leave();
        await tick(2000);
        clients.push(
          ...Array.from({ length: 10 }, (_, m) =>
            connect(live, { user: `n${String(n)}${String(m)}` }),
          ),
        );
        expect(vi.getTimerCount()).toBe(1);
      }
      for (const client of clients) client.leave();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('starts clean for the next connection: nothing from before reaches a client that did not ask', async () => {
      const live = rig.hub();
      const first = connect(live);
      await tick(0);
      rig.db.add('post', post('seen'));
      rig.db.add('counts', { items: [] });
      await tick();
      expect(first.ids()).toEqual(['11', '12']);
      first.leave();
      rig.db.add('post', post('while nobody watched'));
      await tick(30_000);
      expect(rig.db.calls.latestId).toBe(1);

      const second = connect(live, { user: 'u2' });
      await tick(0);
      expect(rig.db.calls.latestId).toBe(2);
      expect(second.state.messages).toEqual([{ id: '13', event: 'ping', data: '{}' }]);
      rig.db.add('post', post('new'));
      await tick();
      expect(second.ids()).toEqual(['14']);
      // The first client's old events are not in the ring of the new run.
      const third = connect(live, { user: 'u3' });
      expect(third.state.messages).toEqual([{ id: '14', event: 'ping', data: '{}' }]);
      expect(live.stats().buffered).toBe(1);
    });

    it('starts again at once when the last one leaves and another joins in the same tick', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      a.leave();
      const b = connect(live, { user: 'u2' });
      expect(vi.getTimerCount()).toBe(1);
      await tick(0);
      expect(b.pings()).toHaveLength(1);
      expect(live.stats()).toMatchObject({ connections: 1, running: true, cursor: 10 });
    });
  });

  describe('a read that outlives its loop', () => {
    it('drops the rows of a read from before a stop and a start', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      rig.db.add('post', post('p1'));
      const held = rig.db.holdSince(true);
      await tick();
      // The read began with p1 in the topic; its only tab leaves, another opens.
      a.leave();
      const b = connect(live, { user: 'u2' });
      await tick(0);
      // b's hub started after p1: b's cursor is 11, and the stale read (after 10) must not replay it.
      expect(live.stats().cursor).toBe(11);
      held.open();
      await tick(0);
      await tick();
      expect(b.events()).toEqual([]);
      expect(live.stats()).toMatchObject({ cursor: 11, buffered: 0 });
      // The new loop works: a new event arrives once.
      rig.db.add('post', post('p2'));
      await tick();
      expect(b.ids()).toEqual(['12']);
    });

    it('drops the answer of a first read for the cursor that arrives after a restart', async () => {
      const live = rig.hub();
      const late = rig.db.holdLatest();
      const a = connect(live);
      await tick(0);
      a.leave();
      rig.db.add('post', post('p1'));
      const b = connect(live, { user: 'u2' });
      await tick(0);
      // b's own read of the newest ID is also held; the stale one (10) comes back first.
      late.open();
      await tick(0);
      expect(live.stats().cursor).toBe(11);
      expect(b.state.messages).toEqual([{ id: '11', event: 'ping', data: '{}' }]);
    });

    // A read that fails after its loop was stopped and a new one started is ignored: it is no
    // outage of the new run, which still logs its own first one.
    it('does not log the failure of a read from a loop that was stopped', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      const held = rig.db.holdSince(true);
      await tick();
      a.leave();
      connect(live, { user: 'u2' });
      await tick(0);
      held.fail();
      await tick(0);
      expect(rig.log).not.toHaveBeenCalled();
    });

    it('logs the first outage of a new run even after a stale read failed', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      const held = rig.db.holdSince(true);
      await tick();
      a.leave();
      connect(live, { user: 'u2' });
      await tick(0);
      held.fail(new Error('stale'));
      await tick(0);
      rig.db.fail(1);
      await tick();
      expect(rig.log.mock.calls.map(([, error]) => (error as Error).message)).toEqual([
        'database away',
      ]);
    });

    it('lets a stale read and the new run overlap without either spoiling the other', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      const held = rig.db.holdSince(true);
      await tick();
      a.leave();
      const b = connect(live, { user: 'u2' });
      await tick(0);
      // The new run reads and delivers while the stale read is still out.
      rig.db.add('post', post('p1'));
      await tick();
      expect(b.ids()).toEqual(['11']);
      held.open();
      await tick(0);
      expect(b.ids()).toEqual(['11']);
      expect(live.stats()).toMatchObject({ cursor: 11, buffered: 1, connections: 1 });
      rig.db.add('post', post('p2'));
      await tick();
      expect(b.ids()).toEqual(['11', '12']);
    });

    it('closes nobody for a stale flag read that said "off" after a restart', async () => {
      const live = rig.hub();
      const open = rig.flag.hold();
      rig.flag.state.on = false;
      const a = connect(live);
      await tick(0);
      // The first poll waits with the answer "off"; the only tab leaves and another opens.
      a.leave();
      rig.flag.state.on = true;
      const b = connect(live, { user: 'u2' });
      await tick(0);
      open();
      await tick(0);
      expect(b.state.closed).toBe(false);
      expect(live.stats().connections).toBe(1);
      expect(b.pings()).toHaveLength(1);
    });

    it('logs again for an outage after a restart, not only for the first one', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      rig.db.fail(3);
      await tick(3000);
      expect(rig.log).toHaveBeenCalledTimes(1);
      a.leave();
      const b = connect(live, { user: 'u2' });
      await tick(0);
      rig.db.fail(3);
      await tick(3000);
      expect(rig.log).toHaveBeenCalledTimes(2);
      expect(b.state.closed).toBe(false);
    });
  });

  describe('the last connection dropped by the hub itself', () => {
    /** The hub is as it is when nobody ever connected, and the next tab gets its events. */
    async function serves(live: ReturnType<typeof rig.hub>) {
      expect(live.stats()).toEqual({
        connections: 0,
        users: 0,
        running: false,
        buffered: 0,
        cursor: null,
      });
      expect(vi.getTimerCount()).toBe(0);
      const next = connect(live, { user: 'next' });
      await tick(0);
      rig.db.add('post', post('after'));
      await tick(2000);
      expect(next.ids()).toEqual([String(rig.db.latest)]);
    }

    // When tend() drops the last connection (a client that stopped reading, a socket that fails
    // on its ping), the loop stops there and reads nothing for it, so the next tab's loop polls.
    it('serves the next tab after tend dropped the last one for not reading', async () => {
      const live = rig.hub();
      const stalled = connect(live);
      await tick(0);
      stalled.state.buffered = 64 * 1024 + 1;
      await tick();
      expect(stalled.state.closed).toBe(true);
      await serves(live);
    });

    it('serves the next tab after tend dropped the last one for a failing ping', async () => {
      const live = rig.hub();
      const broken = connect(live);
      await tick(0);
      broken.state.sendThrows = true;
      await tick(25_000);
      expect(broken.state.closed).toBe(true);
      await serves(live);
    });

    // The same stop, from inside a read: once sending an event drops the last connection, the
    // read leaves the rest of its batch, and the next tab starts a loop of its own.
    it('serves the next tab after an event dropped the last one mid-batch', async () => {
      const live = rig.hub();
      const stalled = connect(live);
      await tick(0);
      // The client stops reading just after the first event of a batch of three: tend, which
      // runs before the read, saw nothing wrong, so the hub finds out when it sends the second.
      const send = stalled.sink.send;
      stalled.sink.send = (message) => {
        send(message);
        stalled.state.buffered = 64 * 1024 + 1;
      };
      for (let n = 0; n < 3; n++) rig.db.add('counts', { n });
      await tick();
      expect(stalled.state.closed).toBe(true);
      expect(stalled.ids()).toEqual(['11']);
      await serves(live);
    });

    // A connection dropped while the first read welcomes it stops the hub before it reads.
    it('reads nothing once its only connection went while it was welcomed', async () => {
      const live = rig.hub();
      const broken = (() => {
        const client = connect(live);
        client.state.sendThrows = true;
        return client;
      })();
      await tick(0);
      expect(broken.state.closed).toBe(true);
      expect(rig.db.calls.since).toBe(0);
      expect(rig.log).not.toHaveBeenCalled();
    });

    it('serves the next tab after the last one closed by itself in the middle of a read', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      rig.db.add('post', post('p1'));
      const held = rig.db.holdSince(true);
      await tick();
      a.leave();
      held.open();
      await tick(0);
      await serves(live);
    });
  });

  describe('one read at a time', () => {
    it('keeps pinging and checking the session while a read is slow', async () => {
      const live = rig.hub();
      const alive = vi.fn(() => Promise.resolve(true));
      const a = connect(live, { alive });
      await tick(0);
      const held = rig.db.holdSince();
      const reads = rig.db.calls.since;
      // Slow, not stuck: under the 30 seconds after which the read is given up.
      await tick(29_000);
      expect(rig.db.calls.since - reads).toBe(1);
      expect(a.pings().length).toBeGreaterThanOrEqual(2);
      expect(alive).toHaveBeenCalled();
      expect(a.state.closed).toBe(false);
      held.open();
      await tick();
      expect(a.state.closed).toBe(false);
    });

    it('delivers what a slow read brought once, in order, to every tab', async () => {
      const live = rig.hub();
      const a = connect(live, { user: 'a' });
      const b = connect(live, { user: 'b' });
      await tick(0);
      for (let n = 0; n < 6; n++) rig.db.add(n % 2 ? 'counts' : 'post', { n });
      const held = rig.db.holdSince();
      await tick(5000);
      expect(a.events()).toEqual([]);
      rig.db.add('post', post('during'));
      held.open();
      await tick(0);
      await tick();
      const expected = ['11', '12', '13', '14', '15', '16', '17'];
      expect(a.ids()).toEqual(expected);
      expect(b.ids()).toEqual(expected);
    });

    it('goes on from the last row of a page when the next page fails', async () => {
      const live = rig.hub({ page: 2 });
      const a = connect(live);
      await tick(0);
      for (let n = 0; n < 5; n++) rig.db.add('counts', { n });
      // First poll: page one (11, 12) is read, page two fails.
      rig.db.failSinceAt(2);
      await tick();
      expect(a.ids()).toEqual(['11', '12']);
      expect(live.stats().cursor).toBe(12);
      await tick();
      expect(a.ids()).toEqual(['11', '12', '13', '14', '15']);
    });

    it('does not ask the session twice while a check has not answered', async () => {
      const live = rig.hub();
      const never = vi.fn(() => new Promise<boolean>(() => {}));
      const a = connect(live, { alive: never });
      await tick(0);
      await tick(5 * 60_000);
      expect(never).toHaveBeenCalledTimes(1);
      // A check that never answers neither signs the person out nor stops the pings.
      expect(a.state.closed).toBe(false);
      expect(a.pings().length).toBeGreaterThan(5);
    });
  });

  describe('the database away', () => {
    it('keeps every tab open and pinged, logging once a minute, and again after a recovery', async () => {
      const live = rig.hub();
      const a = connect(live);
      const b = connect(live, { user: 'u2' });
      await tick(0);
      rig.db.fail(130);
      await tick(130_000);
      expect(a.state.closed || b.state.closed).toBe(false);
      // Failures 1, 61 and 121.
      expect(rig.log).toHaveBeenCalledTimes(3);
      // The pings have gone out the whole time, carrying the ID the hub had read.
      expect(a.pings().length).toBeGreaterThanOrEqual(5);
      expect(a.pings().at(-1)).toEqual({ id: '10', event: 'ping', data: '{}' });
      await tick(2000);
      rig.db.fail(1);
      await tick(2000);
      expect(rig.log).toHaveBeenCalledTimes(4);
    });

    it('loses nothing the ring holds: events from before and during the outage reach every tab once', async () => {
      const live = rig.hub();
      const a = connect(live, { user: 'a' });
      await tick(0);
      const before = rig.db.add('post', post('before'));
      await tick();
      rig.db.fail(20);
      const during = [
        rig.db.add('counts', { items: [] }),
        rig.db.add('rights', { uuids: [] }),
        rig.db.add('post', post('during')),
      ];
      await tick(15_000);
      expect(a.ids()).toEqual([String(before.id)]);
      // A tab dropped and came back in the middle of the outage: replay from the ring works.
      const b = connect(live, { user: 'b', last: before.id - 1 });
      expect(b.ids()).toEqual([String(before.id)]);
      const c = connect(live, { user: 'c' });
      await tick(10_000);
      expect(a.ids()).toEqual([before, during[0], during[2]].map((row) => String(row!.id)));
      expect(b.ids()).toEqual([before, during[0], during[2]].map((row) => String(row!.id)));
      expect(c.ids()).toEqual([during[0], during[2]].map((row) => String(row!.id)));
      // Afterwards, a tab that saw it all and one that reconnects with the middle one agree.
      const d = connect(live, { user: 'd', last: during[0]!.id });
      expect(d.ids()).toEqual([String(during[2]!.id)]);
    });

    it('decides replay or reset for tabs that opened during an outage at the start, once it ends', async () => {
      const live = rig.hub();
      rig.db.fail(5);
      const stale = connect(live, { user: 'a', last: 3 });
      const current = connect(live, { user: 'b', last: 10 });
      const fresh = connect(live, { user: 'c' });
      await tick(4000);
      for (const client of [stale, current, fresh]) expect(client.state.messages).toEqual([]);
      await tick(3000);
      expect(stale.state.messages).toEqual([{ event: 'reset', data: '{}' }]);
      expect(current.state.messages).toEqual([{ id: '10', event: 'ping', data: '{}' }]);
      expect(fresh.state.messages).toEqual([{ id: '10', event: 'ping', data: '{}' }]);
    });

    it('does not ping a tab that has not been welcomed, and pings it once it has', async () => {
      const live = rig.hub();
      rig.db.fail(40);
      const a = connect(live);
      await tick(35_000);
      expect(a.state.messages).toEqual([]);
      await tick(10_000);
      expect(a.pings().length).toBeGreaterThanOrEqual(1);
      expect(a.state.closed).toBe(false);
    });

    it('survives an outage that hits only the first page of a catch-up', async () => {
      const live = rig.hub({ page: 3 });
      const a = connect(live);
      await tick(0);
      for (let n = 0; n < 7; n++) rig.db.add('counts', { n });
      rig.db.failSinceAt(1);
      await tick();
      expect(a.ids()).toEqual([]);
      await tick();
      expect(a.ids().map(Number)).toEqual([11, 12, 13, 14, 15, 16, 17]);
    });
  });
});
