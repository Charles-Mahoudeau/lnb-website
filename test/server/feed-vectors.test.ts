import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { feedNotificationService } from '~~/server/services/feed/notifications';
import { feedPinService } from '~~/server/services/feed/pins';
import { feedPostService } from '~~/server/services/feed/posts';
import { feedLimits } from '~~/server/services/feed/shared';
import { feedViewService } from '~~/server/services/feed/views';

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

// The test vectors of docs/feed-mod.md, 13.3 to 13.5, exactly as written there, with the
// example players of section 4: Camille and Mika write, Lune is a Warden admin, Kael an
// announcer who hides his real name, Visitor42 a guest.

async function cast() {
  return {
    camille: await person('Camille Roux', { accounts: 2 }),
    mika: await person('Mika Lefort'),
    lune: await person('Lune Garnier', { role: 'warden-admin' }),
    kael: await person('Kael Dubois', { role: 'feed-announcer', showRealName: false }),
    visitor: { uuid: randomUUID() },
  };
}

function row(view: { author: unknown; mine: boolean; canDelete: boolean; canPin: boolean }) {
  return {
    author: view.author === null ? 'null' : 'filled',
    mine: view.mine,
    canDelete: view.canDelete,
    canPin: view.canPin,
  };
}

describe('Feed test vectors', () => {
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
  });

  it('13.3: an anonymous Global post, its replies and an anonymous announcement, by viewer', async () => {
    const { camille, mika, lune, kael, visitor } = await cast();
    const from = await latestEvent();
    const { post: global } = await post(camille, 'Qui vient ?', { anonymous: true });
    const second = { uuid: camille.accounts[1]!.uuid };
    const table = async (id: string, viewers: { uuid: string }[]) =>
      Promise.all(viewers.map(async (viewer) => row((await viewOf(viewer, id))!)));
    expect(await table(global.id, [camille, second, lune, kael, mika, visitor])).toEqual([
      { author: 'filled', mine: true, canDelete: true, canPin: false },
      { author: 'filled', mine: true, canDelete: true, canPin: false },
      { author: 'filled', mine: false, canDelete: true, canPin: false },
      { author: 'null', mine: false, canDelete: false, canPin: false },
      { author: 'null', mine: false, canDelete: false, canPin: false },
      { author: 'null', mine: false, canDelete: false, canPin: false },
    ]);

    const { post: mikaReply } = await reply(mika, global.id);
    expect(mikaReply.replyTo).toBeNull();
    const { post: luneReply } = await reply(lune, global.id, mikaReply.id, { anonymous: true });
    expect(await viewOf(kael, luneReply.id)).toMatchObject({
      author: null,
      replyTo: { id: mikaReply.id, anonymous: false, name: 'Mika L.' },
    });

    const { post: announcement } = await post(kael, 'Événement PvP', {
      feed: 'announcements',
      anonymous: true,
    });
    expect(await table(announcement.id, [kael, lune, camille, visitor])).toEqual([
      { author: 'filled', mine: true, canDelete: true, canPin: true },
      { author: 'filled', mine: false, canDelete: true, canPin: true },
      { author: 'null', mine: false, canDelete: false, canPin: false },
      { author: 'null', mine: false, canDelete: false, canPin: false },
    ]);

    const { items } = await feedNotificationService.list();
    expect(
      items.map((item) => ({
        kind: item.kind,
        players: item.players,
        except: item.except,
        author: item.post.author?.username ?? null,
      })),
    ).toEqual([
      {
        kind: 'reply',
        players: camille.accounts.map((account) => account.uuid),
        except: [],
        author: mika.username,
      },
      { kind: 'reply', players: [mika.uuid], except: [], author: null },
      { kind: 'announcement', players: null, except: [kael.uuid], author: null },
    ]);
    const posts = (await eventsSince(from)).filter((event) => event.type === 'post');
    expect(posts).toHaveLength(4);
    for (const event of posts) {
      expect(Object.keys(event.data).sort()).toEqual(['createdAt', 'feed', 'id', 'threadId']);
    }
  });

  it('13.4: pages are unshifted by a new post, and skip a deleted one', async () => {
    const { mika, camille, lune } = await cast();
    const ids: string[] = [];
    for (let i = 1; i <= 25; i++) ids.push((await post(mika, `G${String(i)}`)).post.id);
    const page = (before?: string) =>
      feedViewService.page({ who: { player: camille.uuid }, feed: 'global', limit: 20, before });
    const texts = (rows: { text: string }[]) => rows.map((item) => item.text);

    // 1.
    const first = await page();
    expect(texts(first.posts)).toEqual(Array.from({ length: 20 }, (_, i) => `G${String(25 - i)}`));
    const c1 = first.next!;
    // 2. G26 doesn't shift the second page.
    await post(mika, 'G26');
    const second = await page(c1);
    expect(texts(second.posts)).toEqual(['G5', 'G4', 'G3', 'G2', 'G1']);
    expect(second.next).toBeNull();
    // 3. G3 deleted between the pages.
    await feedPostService.remove({ actor: server(mika), postId: ids[2]! });
    expect(texts((await page(c1)).posts)).toEqual(['G5', 'G4', 'G2', 'G1']);

    // 4. Announcements A1 to A5, A2 then A4 pinned.
    const a: string[] = [];
    for (let i = 1; i <= 5; i++) {
      a.push((await post(lune, `A${String(i)}`, { feed: 'announcements' })).post.id);
    }
    await feedPinService.pin({ actor: server(lune), postId: a[1]! });
    await feedPinService.pin({ actor: server(lune), postId: a[3]! });
    const announcements = await feedViewService.page({
      who: { player: camille.uuid },
      feed: 'announcements',
    });
    expect(texts(announcements.pinned)).toEqual(['A4', 'A2']);
    expect(texts(announcements.posts)).toEqual(['A5', 'A3', 'A1']);
    // Global has no pinned group; neither has a later page.
    expect(first.pinned).toEqual([]);
    const small = await feedViewService.page({
      who: { player: camille.uuid },
      feed: 'announcements',
      limit: 1,
    });
    expect(texts(small.pinned)).toEqual(['A4', 'A2']);
    const later = await feedViewService.page({
      who: { player: camille.uuid },
      feed: 'announcements',
      limit: 1,
      before: small.next!,
    });
    expect(later.pinned).toEqual([]);
    expect(texts(later.posts)).toEqual(['A3']);
  });

  it('13.5: pins, from the limit to a deleted pinned post', async () => {
    const { lune, kael, mika } = await cast();
    const [A, B, C, D] = (await Promise.all(
      ['A', 'B', 'C', 'D'].map(
        async (text) => (await post(lune, text, { feed: 'announcements' })).post.id,
      ),
    )) as [string, string, string, string];
    for (const id of [A, B, C]) await feedPinService.pin({ actor: server(lune), postId: id });
    const { post: dReply } = await reply(mika, D);

    // 1.
    let from = await latestEvent();
    expect(
      await problemOf(feedPinService.pin({ actor: server(lune), postId: D, replace: false })),
    ).toMatchObject({
      status: 409,
      problem: 'pinLimit',
      oldest: { id: A },
    });
    expect(await eventsSince(from)).toEqual([]);
    // 2.
    const replaced = await feedPinService.pin({ actor: server(lune), postId: D, replace: true });
    expect(replaced.pinned.map((pin) => pin.id)).toEqual([D, C, B]);
    expect(replaced.unpinned).toBe(A);
    expect(await eventsSince(from)).toEqual([{ type: 'pins', data: { pinned: replaced.pinned } }]);
    // 3.
    from = await latestEvent();
    expect(await feedPinService.pin({ actor: server(lune), postId: D })).toEqual({
      pinned: replaced.pinned,
      unpinned: null,
    });
    expect(await eventsSince(from)).toEqual([]);
    // Unpinning what isn't pinned changes nothing either.
    expect((await feedPinService.unpin({ actor: server(lune), postId: A })).pinned).toEqual(
      replaced.pinned,
    );
    expect(await eventsSince(from)).toEqual([]);
    // 4.
    const unpinned = await feedPinService.unpin({ actor: server(kael), postId: C });
    expect(unpinned).toEqual({ pinned: [replaced.pinned[0], replaced.pinned[2]], unpinned: null });
    // 5.
    expect(await problemOf(feedPinService.pin({ actor: server(mika), postId: B }))).toMatchObject({
      status: 403,
      problem: 'notAllowed',
    });
    // 6.
    const { post: global } = await post(lune, 'Global');
    expect(
      await problemOf(feedPinService.pin({ actor: server(lune), postId: global.id })),
    ).toMatchObject({
      status: 409,
      problem: 'notPinnable',
    });
    // 7.
    from = await latestEvent();
    await feedPostService.remove({ actor: server(lune), postId: D });
    const events = await eventsSince(from);
    expect(events.map((event) => event.type)).toEqual(['deleted', 'pins']);
    expect(events[0]!.data).toEqual({
      items: [
        { id: D, feed: 'announcements', threadId: null },
        { id: dReply.id, feed: 'announcements', threadId: D },
      ],
    });
    expect(events[1]!.data).toEqual({ pinned: [expect.objectContaining({ id: B })] });
  });
});
