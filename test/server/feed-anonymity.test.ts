import { randomUUID } from 'node:crypto';

import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { audit } from '~~/server/db/schema';
import { feedLikeService } from '~~/server/services/feed/likes';
import { feedNotificationService } from '~~/server/services/feed/notifications';
import { feedPinService } from '~~/server/services/feed/pins';
import { feedPostService } from '~~/server/services/feed/posts';
import { feedRightsService } from '~~/server/services/feed/rights';
import { feedLimits } from '~~/server/services/feed/shared';
import { feedViewService } from '~~/server/services/feed/views';

import {
  eventsSince,
  latestEvent,
  person,
  post,
  reply,
  server,
  setFlags,
  wipe,
} from './feed-helpers';
import type { Person } from './feed-helpers';

// Anonymity end to end (docs/feed.md, "Anonymous posts and replies"; feed-mod.md 3, 12, 13.3): a
// thread full of anonymous posts, replies and an anonymous announcement, read by everyone through
// every way out of the services. Nothing but the author's own views and moderators' views may
// carry an anonymous author: not a page, a thread, a view, a notification's post, an event, or a
// reply-to line, which never names an anonymous target, for moderators either.

interface World {
  camille: Person; // anonymous Global post, two accounts
  kael: Person; // anonymous announcement, an announcer
  nina: Person; // anonymous reply to Camille's post
  oscar: Person; // anonymous replies to Nina's and to Mika's
  mika: Person; // writes in the open only
  pat: Person; // an announcer who doesn't moderate, reads
  lune: Person; // a moderator
  guest: { uuid: string };
  ids: Record<string, string>;
  from: number;
}

let world: World;

/** Every way an identity can be written in an answer. */
function identity(who: Person): string[] {
  const [first = '', last = ''] = who.name.split(' ');
  return [
    who.id,
    ...who.accounts.flatMap((account) => [account.uuid, account.username]),
    `${first} ${last.charAt(0)}.`,
  ];
}

function leaks(value: unknown, who: Person): string[] {
  const text = JSON.stringify(value);
  return identity(who).filter((needle) => text.includes(needle));
}

/** Everything a reader gets from the services, in game and in the browser. */
async function everythingFor(reader: { uuid: string; id?: string }) {
  const { ids } = world;
  const who = { player: reader.uuid };
  const out: unknown[] = [];
  for (const feed of ['announcements', 'global'] as const) {
    out.push(await feedViewService.page({ who, feed }));
    if (reader.id) out.push(await feedViewService.page({ who: { userId: reader.id }, feed }));
  }
  for (const id of [ids.camillePost!, ids.announcement!]) {
    out.push(await feedViewService.thread({ who, id }));
    if (reader.id) out.push(await feedViewService.thread({ who: { userId: reader.id }, id }));
  }
  const all = Object.values(ids);
  out.push(await feedViewService.views({ viewers: [reader.uuid], ids: all.slice(0, 20) }));
  if (reader.id) out.push(await feedViewService.viewsOf({ userId: reader.id }, all.slice(0, 20)));
  out.push(await feedRightsService.playerState(reader.uuid));
  return out;
}

describe('Feed anonymity', () => {
  beforeAll(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
    const camille = await person('Camille Roux', { accounts: 2 });
    const kael = await person('Kael Dubois', { role: 'feed-announcer' });
    const nina = await person('Nina Petit');
    const oscar = await person('Oscar Blanc', { showRealName: false });
    const mika = await person('Mika Lefort');
    const pat = await person('Pat Moreau', { role: 'feed-announcer' });
    const lune = await person('Lune Garnier', { role: 'warden-admin' });
    const from = await latestEvent();

    const anonymous = { anonymous: true };
    const camillePost = (await post({ uuid: camille.accounts[1]!.uuid }, 'Qui vient ?', anonymous))
      .post;
    const announcement = (
      await post(kael, 'Événement PvP', { feed: 'announcements', anonymous: true })
    ).post;
    const ninaReply = (await reply(nina, camillePost.id, null, anonymous)).post;
    const oscarToNina = (await reply(oscar, camillePost.id, ninaReply.id, anonymous)).post;
    const mikaToNina = (await reply(mika, camillePost.id, ninaReply.id)).post;
    const oscarToMika = (await reply(oscar, camillePost.id, mikaToNina.id, anonymous)).post;
    const mikaToAnnouncement = (await reply(mika, announcement.id)).post;
    const ninaToMika = (await reply(nina, announcement.id, mikaToAnnouncement.id, anonymous)).post;
    const mikaPost = (await post(mika, 'En clair')).post;
    // Anonymous authors like, pin and get liked: none of it may name them either.
    await feedLikeService.setLiked({ actor: server(nina), postId: mikaPost.id, liked: true });
    await feedLikeService.setLiked({ actor: server(mika), postId: camillePost.id, liked: true });
    await feedPinService.pin({ actor: server(pat), postId: announcement.id });

    world = {
      camille,
      kael,
      nina,
      oscar,
      mika,
      pat,
      lune,
      guest: { uuid: randomUUID() },
      from,
      ids: {
        camillePost: camillePost.id,
        announcement: announcement.id,
        ninaReply: ninaReply.id,
        oscarToNina: oscarToNina.id,
        mikaToNina: mikaToNina.id,
        oscarToMika: oscarToMika.id,
        mikaToAnnouncement: mikaToAnnouncement.id,
        ninaToMika: ninaToMika.id,
        mikaPost: mikaPost.id,
      },
    };
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
  });

  it('gives a guest, a player and an announcer no anonymous author anywhere', async () => {
    const { camille, kael, nina, oscar, mika, pat, guest } = world;
    for (const reader of [guest, mika, pat]) {
      const everything = await everythingFor(reader);
      for (const author of [camille, kael, nina, oscar]) {
        expect(leaks(everything, author), `${JSON.stringify(reader)} sees ${author.name}`).toEqual(
          [],
        );
      }
    }
  });

  it('gives each anonymous author their own posts and nobody else’s', async () => {
    const { camille, kael, nina, oscar } = world;
    const authors = [camille, kael, nina, oscar];
    for (const reader of authors) {
      const everything = await everythingFor(reader);
      expect(leaks(everything, reader).length, `${reader.name} sees themself`).toBeGreaterThan(0);
      for (const other of authors.filter((candidate) => candidate !== reader)) {
        expect(leaks(everything, other), `${reader.name} sees ${other.name}`).toEqual([]);
      }
    }
    // From Camille's other account too: mine, with the author.
    const { views } = await feedViewService.views({
      viewers: [camille.uuid],
      ids: [world.ids.camillePost!],
    });
    expect(views[0]!.posts[0]).toMatchObject({
      mine: true,
      canDelete: true,
      author: { uuid: camille.accounts[1]!.uuid },
    });
  });

  it('gives a moderator every author, but never a name on a line to an anonymous target', async () => {
    const { lune, ids, camille, kael, nina, oscar } = world;
    const everything = await everythingFor(lune);
    for (const author of [camille, kael, nina, oscar]) {
      expect(leaks(everything, author).length, author.name).toBeGreaterThan(0);
    }
    const { views } = await feedViewService.views({
      viewers: [lune.uuid],
      ids: [ids.oscarToNina!, ids.mikaToNina!, ids.oscarToMika!, ids.ninaToMika!],
    });
    expect(views[0]!.posts.map((row) => row.replyTo)).toEqual([
      { id: ids.ninaReply, anonymous: true, name: null },
      { id: ids.ninaReply, anonymous: true, name: null },
      { id: ids.mikaToNina, anonymous: false, name: 'Mika L.' },
      { id: ids.mikaToAnnouncement, anonymous: false, name: 'Mika L.' },
    ]);
    expect(views[0]!.posts.every((row) => row.author !== null && !row.mine)).toBe(true);
  });

  it('shows no badge or handle without the author: an anonymous announcement is just Anonymous', async () => {
    const { pat, mika, ids } = world;
    for (const reader of [pat, mika]) {
      const { views } = await feedViewService.views({
        viewers: [reader.uuid],
        ids: [ids.announcement!],
      });
      expect(views[0]!.posts[0]).toMatchObject({
        anonymous: true,
        author: null,
        mine: false,
        canDelete: false,
      });
    }
    // Pat announces, so may pin it, still without seeing who wrote it.
    const page = await feedViewService.page({ who: { player: pat.uuid }, feed: 'announcements' });
    expect(page.pinned[0]).toMatchObject({ id: ids.announcement, author: null, canPin: true });
  });

  it('keeps anonymous authors out of notifications’ posts; only players and except name them', async () => {
    const { camille, kael, nina, oscar, mika } = world;
    const { items } = await feedNotificationService.list();
    const byPost = new Map(items.map((item) => [item.post.id, item]));
    // The announcement: everyone but Kael's accounts, with no author.
    expect(byPost.get(world.ids.announcement!)).toMatchObject({
      kind: 'announcement',
      players: null,
      except: [kael.uuid],
      post: { anonymous: true, author: null },
    });
    // Nina's anonymous reply notifies Camille, who posted anonymously: her accounts in players.
    expect(byPost.get(world.ids.ninaReply!)).toMatchObject({
      kind: 'reply',
      players: camille.accounts.map((account) => account.uuid),
      except: [],
      post: { anonymous: true, author: null },
    });
    // Mika's open reply to Nina names Mika, and notifies Nina.
    expect(byPost.get(world.ids.mikaToNina!)).toMatchObject({
      players: [nina.uuid],
      post: { author: { username: mika.username } },
    });
    const stripped = items.map(({ players: _players, except: _except, ...rest }) => rest);
    for (const author of [camille, kael, nina, oscar]) {
      expect(leaks(stripped, author), author.name).toEqual([]);
    }
  });

  it('sends events that name nobody, and audits an anonymous pin with no target', async () => {
    const { camille, kael, nina, oscar, mika } = world;
    const events = await eventsSince(world.from);
    expect(new Set(events.map((event) => event.type))).toEqual(
      new Set(['post', 'counts', 'notification', 'pins']),
    );
    for (const event of events.filter((candidate) => candidate.type === 'post')) {
      expect(Object.keys(event.data).sort()).toEqual(['createdAt', 'feed', 'id', 'threadId']);
    }
    for (const author of [camille, kael, nina, oscar, mika]) {
      expect(leaks(events, author), author.name).toEqual([]);
    }
    const [pinned] = await db.select().from(audit).where(eq(audit.action, 'minecraft.feed.pin'));
    expect(pinned).toMatchObject({ targetUserId: null, actorUserId: world.pat.id });
  });

  it('keeps the author of an anonymous post a moderator deletes in the audit only', async () => {
    const { lune, oscar, ids, mika } = world;
    const from = await latestEvent();
    await feedPostService.remove({ actor: server(lune), postId: ids.oscarToMika!, reason: 'Non' });
    const [entry] = await db
      .select()
      .from(audit)
      .where(like(audit.action, 'minecraft.feed.delete'));
    // The audit is read by moderators only, who see anonymous authors anyway.
    expect(entry).toMatchObject({
      targetUserId: oscar.id,
      data: { anonymous: true, postId: ids.oscarToMika },
    });
    const events = await eventsSince(from);
    expect(leaks(events, oscar)).toEqual([]);
    expect(events.map((event) => event.type)).toEqual(['deleted', 'counts']);
    // Mika's reply lost an answer; nothing else names Oscar.
    const { views } = await feedViewService.views({ viewers: [mika.uuid], ids: [ids.mikaToNina!] });
    expect(views[0]!.posts[0]!.replies).toBe(0);
  });
});
