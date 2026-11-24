import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FEED_LIVE_LIMITS } from '~~/server/services/feed/live';

import { connect, fakeSink, hubRig, post, refusedJoin, tick } from './feed-live-hub-helpers';

// The browser stream's hub, read against the contract (docs/feed.md, "Live updates in the
// browser") rather than the code: fan-out and order, the replay boundaries one by one, the ring at
// 500 and 501, both caps and everything that frees a slot, and the flag going off and coming back.
// The poller's lifecycle and the database being away are in feed-live-hub-lifecycle.test.ts.

describe('the Feed live hub, edges', () => {
  let rig: ReturnType<typeof hubRig>;
  beforeEach(() => {
    vi.useFakeTimers();
    rig = hubRig();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('fan-out and order', () => {
    it('gives each connection exactly the events after its own opening, in the same order', async () => {
      const live = rig.hub();
      const early = [
        connect(live, { user: 'a' }),
        connect(live, { user: 'b' }),
        connect(live, { user: 'c' }),
      ];
      await tick(0);
      const wanted: { id: string; event: string; data: string }[] = [];
      const types = ['post', 'counts', 'rights', 'deleted', 'notification', 'pins', 'post'];
      for (let n = 0; n < 12; n++) {
        const type = types[n % types.length]!;
        const row = rig.db.add(type, { n });
        if (['post', 'counts', 'deleted', 'pins'].includes(type)) {
          wanted.push({ id: String(row.id), event: type, data: JSON.stringify({ n }) });
        }
      }
      await tick();
      // Four more join once a first burst has gone out, and see only what comes next.
      const late = [1, 2, 3, 4].map((n) => connect(live, { user: `late${String(n)}` }));
      const second: typeof wanted = [];
      for (let n = 0; n < 6; n++) {
        const row = rig.db.add(n % 2 ? 'counts' : 'post', { later: n });
        second.push({
          id: String(row.id),
          event: n % 2 ? 'counts' : 'post',
          data: JSON.stringify({ later: n }),
        });
      }
      await tick();
      for (const client of early) expect(client.events()).toEqual([...wanted, ...second]);
      for (const client of late) expect(client.events()).toEqual(second);
      // Strictly rising IDs, whatever the connection.
      const ids = early[0]!.events().map((message) => Number(message.id));
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('sends nothing to a connection that has not been welcomed yet', async () => {
      const live = rig.hub();
      const held = rig.db.holdLatest();
      const waiting = connect(live);
      await tick(0);
      rig.db.add('post', post('p1'));
      await tick(3000);
      expect(waiting.state.messages).toEqual([]);
      held.open();
      await tick(0);
      // Welcomed at the cursor read before p1: p1 then arrives live, once.
      await tick();
      expect(waiting.ids()).toEqual(['11']);
      expect(waiting.pings()).toHaveLength(1);
    });

    it('keeps one connection’s order when another is kicked in the middle of a burst', async () => {
      const live = rig.hub();
      const stalled = connect(live, { user: 'a' });
      const healthy = connect(live, { user: 'b' });
      await tick(0);
      for (let n = 0; n < 5; n++) rig.db.add('counts', { n });
      // The stalled client stops reading after the third message of the burst.
      const send = stalled.sink.send;
      let sent = 0;
      stalled.sink.send = (message) => {
        send(message);
        if (++sent === 3) stalled.state.buffered = FEED_LIVE_LIMITS.maxBuffered + 1;
      };
      await tick();
      expect(healthy.events().map((message) => message.id)).toEqual(['11', '12', '13', '14', '15']);
      expect(stalled.state.closed).toBe(true);
      expect(stalled.ids()).toEqual(['11', '12', '13']);
      expect(live.stats().connections).toBe(1);
    });
  });

  describe('what is never sent', () => {
    it('sends no other type than the four public ones, whatever its name', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      for (const type of [
        'rights',
        'notification',
        'economy',
        'quests',
        'POST',
        'post ',
        '',
        'toString',
        '__proto__',
        'constructor',
        'reset',
        'ping',
      ]) {
        rig.db.add(type, { secret: 'viewer-only', uuids: ['x'] });
      }
      rig.db.add('post', post('only'));
      await tick();
      expect(a.events().map((message) => message.event)).toEqual(['post']);
      expect(
        a.state.messages.filter((m) => m.event === 'reset' || m.event === 'ping'),
      ).toHaveLength(1);
      // Not kept for a reconnecting tab either, and the ring holds only the public one.
      expect(live.stats().buffered).toBe(1);
      const b = connect(live, { user: 'u2', last: 10 });
      expect(b.state.messages.map((message) => message.event)).toEqual(['post']);
      // The cursor still moved past the private rows: a ping tells the tab it has everything.
      expect(live.stats().cursor).toBe(rig.db.latest);
    });

    it('forwards the row’s data as it is, adding no field of its own to any message', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      const data = { id: 'p1', feed: 'global', threadId: null, createdAt: 'x' };
      rig.db.add('post', data);
      await tick();
      const [message] = a.events();
      expect(Object.keys(message!).sort()).toEqual(['data', 'event', 'id']);
      expect(message!.data).toBe(JSON.stringify(data));
      // Replayed, it is the same message.
      const b = connect(live, { user: 'u2', last: 10 });
      expect(b.state.messages).toEqual([message]);
    });
  });

  describe('replay boundaries', () => {
    /** Ring of five: events 11 to 17 posted, 13 to 17 kept, 12 the newest one dropped. */
    async function crowded() {
      const live = rig.hub({ buffer: 5 });
      connect(live, { user: 'keeper' });
      await tick(0);
      const rows = Array.from({ length: 7 }, (_, n) => rig.db.add('post', post(`p${String(n)}`)));
      await tick();
      expect(rows.map((row) => row.id)).toEqual([11, 12, 13, 14, 15, 16, 17]);
      expect(live.stats().buffered).toBe(5);
      return live;
    }
    const kinds = (client: ReturnType<typeof connect>) =>
      client.state.messages.map((message) => `${message.event}:${message.id ?? '-'}`);

    it('answers the newest ID with a ping carrying it, and nothing to replay', async () => {
      const live = await crowded();
      expect(kinds(connect(live, { user: 'u2', last: 17 }))).toEqual(['ping:17']);
    });

    it('replays only the newest event for the ID one behind it', async () => {
      const live = await crowded();
      expect(kinds(connect(live, { user: 'u2', last: 16 }))).toEqual(['post:17']);
    });

    it('replays everything after the oldest event the ring holds', async () => {
      const live = await crowded();
      expect(kinds(connect(live, { user: 'u2', last: 13 }))).toEqual([
        'post:14',
        'post:15',
        'post:16',
        'post:17',
      ]);
    });

    it('replays the whole ring for the newest event it dropped', async () => {
      const live = await crowded();
      expect(kinds(connect(live, { user: 'u2', last: 12 }))).toEqual([
        'post:13',
        'post:14',
        'post:15',
        'post:16',
        'post:17',
      ]);
    });

    it('resets for an ID one older than that, and for anything older', async () => {
      const live = await crowded();
      for (const last of [11, 10, 5, 0]) {
        expect(kinds(connect(live, { user: `old${String(last)}`, last })), String(last)).toEqual([
          'reset:-',
        ]);
      }
    });

    it('resets for an ID above the newest, negative, or not a number', async () => {
      const live = await crowded();
      // The route turns anything that isn't a non-negative integer into -1.
      for (const last of [18, 19, 1_000_000, Number.MAX_SAFE_INTEGER, -1, -2]) {
        expect(kinds(connect(live, { user: `bad${String(last)}`, last })), String(last)).toEqual([
          'reset:-',
        ]);
      }
    });

    it('opens with a ping carrying the newest ID, and nothing else, without a Last-Event-ID', async () => {
      const live = await crowded();
      expect(kinds(connect(live, { user: 'u2' }))).toEqual(['ping:17']);
    });

    it('treats a private event as a valid ID to resume from, replaying what follows', async () => {
      const live = rig.hub();
      connect(live, { user: 'keeper' });
      await tick(0);
      rig.db.add('post', post('a')); // 11
      rig.db.add('rights', { uuids: [] }); // 12
      rig.db.add('post', post('b')); // 13
      rig.db.add('notification', {}); // 14
      await tick();
      expect(kinds(connect(live, { user: 'u2', last: 12 }))).toEqual(['post:13']);
      expect(kinds(connect(live, { user: 'u3', last: 14 }))).toEqual(['ping:14']);
      expect(kinds(connect(live, { user: 'u4', last: 11 }))).toEqual(['post:13']);
    });

    it('does not send a ping as well when it replays, and the replayed tab then goes live', async () => {
      const live = await crowded();
      const b = connect(live, { user: 'u2', last: 15 });
      expect(b.pings()).toHaveLength(0);
      rig.db.add('counts', { items: [] });
      await tick();
      expect(kinds(b)).toEqual(['post:16', 'post:17', 'counts:18']);
    });

    it('on an empty topic accepts 0 as the start, and resets for anything above', async () => {
      const empty = hubRig(0);
      const live = empty.hub();
      connect(live, { user: 'keeper' });
      await tick(0);
      expect(kinds(connect(live, { user: 'u2', last: 0 }))).toEqual(['ping:0']);
      expect(kinds(connect(live, { user: 'u3', last: 1 }))).toEqual(['reset:-']);
      empty.db.add('post', post('first'));
      await tick();
      expect(kinds(connect(live, { user: 'u4', last: 0 }))).toEqual(['post:1']);
    });
  });

  describe('the ring', () => {
    it('keeps exactly 500 public events, then drops the oldest at 501', async () => {
      const live = rig.hub();
      connect(live, { user: 'keeper' });
      await tick(0);
      for (let n = 0; n < 500; n++) rig.db.add('post', post(`p${String(n)}`));
      await tick();
      expect(live.stats().buffered).toBe(500);
      const full = connect(live, { user: 'u2', last: 10 });
      expect(full.state.messages).toHaveLength(500);
      expect(full.state.messages[0]!.id).toBe('11');
      expect(full.state.messages.at(-1)!.id).toBe('510');
      expect(full.state.messages.every((message) => message.event === 'post')).toBe(true);

      rig.db.add('post', post('p500'));
      await tick();
      expect(live.stats().buffered).toBe(500);
      expect(connect(live, { user: 'u3', last: 10 }).state.messages).toEqual([
        { event: 'reset', data: '{}' },
      ]);
      const next = connect(live, { user: 'u4', last: 11 });
      expect(next.state.messages).toHaveLength(500);
      expect(next.state.messages[0]!.id).toBe('12');
      expect(next.state.messages.at(-1)!.id).toBe('511');
    });

    it('counts only public events against the 500', async () => {
      const live = rig.hub();
      connect(live, { user: 'keeper' });
      await tick(0);
      for (let n = 0; n < 700; n++) rig.db.add(n % 2 ? 'rights' : 'post', post(`p${String(n)}`));
      await tick();
      expect(live.stats().buffered).toBe(350);
      // Everything since the start is still replayable: 350 public events in all.
      const back = connect(live, { user: 'u2', last: 10 });
      expect(back.state.messages).toHaveLength(350);
    });

    it('catches up on more events than one poll reads, in order and without loss', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      const total = FEED_LIVE_LIMITS.page * FEED_LIVE_LIMITS.pagesPerPoll + 200;
      for (let n = 0; n < total; n++) rig.db.add('counts', { n });
      await tick();
      expect(a.events()).toHaveLength(FEED_LIVE_LIMITS.page * FEED_LIVE_LIMITS.pagesPerPoll);
      await tick();
      const ids = a.events().map((message) => Number(message.id));
      expect(ids).toHaveLength(total);
      expect(ids).toEqual(Array.from({ length: total }, (_, n) => 11 + n));
      expect(live.stats().buffered).toBe(500);
      // A tab that was 5,000 events behind can only reset.
      expect(connect(live, { user: 'u2', last: 100 }).state.messages[0]!.event).toBe('reset');
    });
  });

  describe('the caps', () => {
    it('makes room for a sixth stream of one account by closing its oldest, saying why', async () => {
      const live = rig.hub();
      const mine = Array.from({ length: 5 }, () => connect(live));
      await tick(0);
      const before = mine.map((client) => client.state.messages.length);
      const { error, client } = refusedJoin(live, 'u1');
      expect(error).toBeNull();
      expect(mine[0]!.state.closed).toBe(true);
      expect(mine[0]!.state.messages.at(-1)).toEqual({
        event: 'closed',
        data: '{"problem":"tooManyStreams"}',
      });
      expect(mine.slice(1).map((one) => one.state.closed)).toEqual([false, false, false, false]);
      expect(mine.slice(1).map((one) => one.state.messages.length)).toEqual(before.slice(1));
      expect(client.state.messages).toEqual([{ id: '10', event: 'ping', data: '{}' }]);
      expect(live.stats()).toMatchObject({ connections: 5, users: 1 });
      // Others are not affected; the next one of the account takes the next oldest's place.
      expect(refusedJoin(live, 'u2').error).toBeNull();
      expect(refusedJoin(live, 'u1').error).toBeNull();
      expect(mine[1]!.state.closed).toBe(true);
      expect(live.stats()).toMatchObject({ connections: 6, users: 2 });
    });

    const ways: [string, (victim: ReturnType<typeof connect>) => Promise<void> | void][] = [
      [
        'a close',
        (victim) => {
          victim.leave();
        },
      ],
      [
        'a stalled client dropped while an event is sent',
        async (victim) => {
          victim.state.buffered = FEED_LIVE_LIMITS.maxBuffered + 1;
          rig.db.add('post', post('x'));
          await tick();
        },
      ],
      [
        'a stalled client dropped with nothing to send',
        async (victim) => {
          victim.state.buffered = FEED_LIVE_LIMITS.maxBuffered + 1;
          await tick();
        },
      ],
      [
        'a socket that throws on send',
        async (victim) => {
          victim.state.sendThrows = true;
          rig.db.add('post', post('x'));
          await tick();
        },
      ],
    ];
    for (const [name, free] of ways) {
      it(`frees exactly one slot of the account with ${name}`, async () => {
        const live = rig.hub();
        const mine = Array.from({ length: 5 }, () => connect(live));
        await tick(0);
        await free(mine[0]!);
        expect(live.stats().connections).toBe(4);
        // The freed slot takes one stream without closing another; the next one closes the oldest.
        expect(refusedJoin(live, 'u1').error).toBeNull();
        expect(mine.slice(1).some((one) => one.state.closed)).toBe(false);
        expect(refusedJoin(live, 'u1').error).toBeNull();
        expect(mine[1]!.state.closed).toBe(true);
        expect(live.stats().connections).toBe(5);
      });
    }

    it('frees a slot when the session is found gone, and not when the check fails', async () => {
      const live = rig.hub();
      let answer: () => Promise<boolean> = () => Promise.reject(new Error('database away'));
      const first = connect(live, { alive: () => answer() });
      for (let n = 0; n < 4; n++) connect(live);
      await tick(0);
      await tick(25_000);
      expect(live.stats().connections).toBe(5);
      expect(first.state.closed).toBe(false);
      answer = () => Promise.resolve(false);
      await tick(25_000);
      expect(first.state.closed).toBe(true);
      expect(live.stats().connections).toBe(4);
    });

    it('does not free a second slot when a closed connection is left again', async () => {
      const live = rig.hub();
      const mine = Array.from({ length: 5 }, () => connect(live));
      await tick(0);
      mine[0]!.leave();
      mine[0]!.leave();
      // Dropped by the hub, then left by the response closing.
      mine[1]!.state.buffered = FEED_LIVE_LIMITS.maxBuffered + 1;
      await tick();
      mine[1]!.leave();
      expect(live.stats().connections).toBe(3);
      expect(refusedJoin(live, 'u1').error).toBeNull();
      expect(refusedJoin(live, 'u1').error).toBeNull();
      expect(mine.slice(2).some((one) => one.state.closed)).toBe(false);
      expect(refusedJoin(live, 'u1').error).toBeNull();
      expect(mine[2]!.state.closed).toBe(true);
      expect(live.stats().connections).toBe(5);
    });

    it('stops at 500 streams in all, at 5 each, and frees one place per close', async () => {
      const live = rig.hub();
      const all: ReturnType<typeof connect>[] = [];
      for (let user = 0; user < 100; user++) {
        for (let n = 0; n < 5; n++) all.push(connect(live, { user: `user${String(user)}` }));
      }
      expect(live.stats()).toMatchObject({ connections: 500, users: 100 });
      const refused = refusedJoin(live, 'newcomer');
      expect(refused.error).toMatchObject({ statusCode: 429, data: { problem: 'tooManyStreams' } });
      expect(refused.client.state.messages).toEqual([]);
      expect(live.stats().users).toBe(100);
      // One closes: one newcomer, not two; the account that left still has its own place.
      all[0]!.leave();
      expect(refusedJoin(live, 'newcomer').error).toBeNull();
      expect(refusedJoin(live, 'another').error).not.toBeNull();
      expect(live.stats().connections).toBe(500);
      await tick(0);
      live.closeAll();
      expect(live.stats()).toMatchObject({ connections: 0, users: 0, running: false });
    });
  });

  describe('the flag', () => {
    it('closes every stream and every slot when a flag goes off, then serves again once on', async () => {
      const live = rig.hub();
      const first = Array.from({ length: 5 }, () => connect(live));
      const other = connect(live, { user: 'u2' });
      await tick(0);
      rig.db.add('post', post('before'));
      await tick();
      rig.flag.state.on = false;
      await tick();
      for (const client of [...first, other]) expect(client.state.closed).toBe(true);
      expect(live.stats()).toEqual({
        connections: 0,
        users: 0,
        running: false,
        buffered: 0,
        cursor: null,
      });
      expect(vi.getTimerCount()).toBe(0);

      rig.flag.state.on = true;
      rig.db.add('post', post('while off'));
      // All five slots are free again, and the hub starts clean from the newest event.
      const again = Array.from({ length: 5 }, () => connect(live));
      await tick(0);
      expect(again.every((client) => !client.state.closed)).toBe(true);
      // A sixth takes the oldest's place, as before the switch.
      expect(refusedJoin(live, 'u1').error).toBeNull();
      expect(again[0]!.state.closed).toBe(true);
      expect(again[1]!.state.messages).toEqual([{ id: '12', event: 'ping', data: '{}' }]);
      // A tab that comes back with its old ID is told to reload: nothing is replayed from before.
      const old = connect(live, { user: 'u3', last: 11 });
      expect(old.state.messages).toEqual([{ event: 'reset', data: '{}' }]);
      rig.db.add('counts', { items: [] });
      await tick();
      expect(again[1]!.ids()).toEqual(['13']);
    });

    it('closes a connection that opens while a flag is off, sending nothing', async () => {
      const live = rig.hub();
      rig.flag.state.on = false;
      const a = connect(live);
      await tick(0);
      expect(a.state.closed).toBe(true);
      expect(a.state.messages).toEqual([]);
      expect(live.stats().connections).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('sees the flag go off within a second while a read hangs, and drops what it read', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      rig.db.add('post', post('p1'));
      const held = rig.db.holdSince();
      await tick();
      rig.flag.state.on = false;
      await tick();
      // The flags are read on the side while the read hangs.
      expect(a.state.closed).toBe(true);
      expect(live.stats()).toMatchObject({ connections: 0, running: false, buffered: 0 });
      held.open();
      await tick();
      expect(a.ids()).toEqual([]);
    });

    it('keeps the streams open when the flags cannot be read, and goes on', async () => {
      const live = rig.hub();
      const a = connect(live);
      await tick(0);
      rig.flag.state.fails = true;
      await tick(5000);
      expect(a.state.closed).toBe(false);
      expect(rig.log).toHaveBeenCalledTimes(1);
      rig.flag.state.fails = false;
      rig.db.add('post', post('p1'));
      await tick();
      expect(a.ids()).toEqual(['11']);
    });

    it('reads the flag at every poll', async () => {
      const live = rig.hub();
      connect(live);
      await tick(0);
      const before = rig.flag.state.calls;
      await tick(4000);
      expect(rig.flag.state.calls - before).toBe(4);
    });
  });

  describe('the sinks', () => {
    it('keeps closing the others when one sink throws on close', async () => {
      const live = rig.hub();
      const clients = [connect(live, { user: 'a' }), connect(live, { user: 'b' })];
      clients[0]!.state.closeThrows = true;
      await tick(0);
      live.closeAll();
      expect(clients.map((client) => client.state.closed)).toEqual([true, true]);
      expect(live.stats().connections).toBe(0);
    });

    it('drops a socket that throws on send without hurting the others', async () => {
      const live = rig.hub();
      const broken = connect(live, { user: 'a' });
      const fine = connect(live, { user: 'b' });
      await tick(0);
      broken.state.sendThrows = true;
      rig.db.add('post', post('p1'));
      rig.db.add('post', post('p2'));
      await tick();
      expect(broken.state.closed).toBe(true);
      expect(fine.ids()).toEqual(['11', '12']);
      expect(live.stats().connections).toBe(1);
    });

    it('drops a socket that throws on its opening ping, and counts it out', async () => {
      const live = rig.hub();
      const keeper = connect(live, { user: 'keeper' });
      await tick(0);
      const broken = fakeSink();
      broken.state.sendThrows = true;
      const leave = live.join({
        userId: 'a',
        lastEventId: null,
        sink: broken.sink,
        sessionAlive: () => Promise.resolve(true),
      });
      expect(broken.state.closed).toBe(true);
      expect(live.stats()).toMatchObject({ connections: 1, users: 1 });
      leave();
      expect(live.stats()).toMatchObject({ connections: 1, users: 1 });
      rig.db.add('post', post('p1'));
      await tick();
      expect(keeper.ids()).toEqual(['11']);
    });
  });
});
