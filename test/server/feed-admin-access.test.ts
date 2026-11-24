import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { audit, feedPost, user, wardenBan } from '~~/server/db/schema';
import { feedPostService } from '~~/server/services/feed/posts';
import { feedLimits } from '~~/server/services/feed/shared';

import { admin, listOf, requireTestWardenAdmin } from './feed-admin-helpers';
import { api, plain, problem, refusal, requireTestUser } from './feed-browser-helpers';
import type { As } from './feed-browser-helpers';
import {
  eventsSince,
  latestEvent,
  person,
  post,
  reply,
  setFlags,
  stubServerUtils,
  viewOf,
  wipe,
} from './feed-helpers';
import type { HttpAnswer, Person } from './feed-helpers';

// Who may call the admin's Feed routes, and what they must not learn or change when they may not
// (docs/feed.md, "For the admin": moderators only, never behind a flag), and that the admin's
// reads leave the other routes' privacy as it was.

/** Every route once, with a valid request for these IDs. */
async function everyRoute(as: As, ids: { post: string; target: string }) {
  return {
    list: await admin.list(as),
    row: await admin.row(as, ids.post),
    announcer: await admin.announcer(as, ids.target),
    setAnnouncer: await admin.setAnnouncer(as, ids.target, { announcer: true }),
    remove: await admin.remove(as, ids.post, { reason: 'Test' }),
  };
}

const ROUTES = ['list', 'row', 'announcer', 'setAnnouncer', 'remove'] as const;

describe('who may call the admin’s Feed routes', () => {
  let camille: Person;
  let mainId: string;

  beforeAll(() => {
    stubServerUtils();
    vi.stubGlobal('requireUser', requireTestUser);
    vi.stubGlobal('requireWardenAdmin', requireTestWardenAdmin);
  });
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
    camille = await person('Camille Roux');
    mainId = (await post(camille, 'Un secret', { anonymous: true })).post.id;
    await reply(camille, mainId);
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const untouched = async () => {
    const [row] = await db.select().from(feedPost).where(eq(feedPost.id, mainId));
    expect(row!.deletedAt).toBeNull();
    const [who] = await db.select({ role: user.role }).from(user).where(eq(user.id, camille.id));
    expect(who!.role).toBeNull();
    expect(await db.select().from(audit).where(eq(audit.targetUserId, camille.id))).toEqual([]);
  };

  it('answers 401 to every route when signed out, and an unknown session the same', async () => {
    const answers = await everyRoute(null, { post: mainId, target: camille.id });
    for (const route of ROUTES) expect(refusal(answers[route]), route).toEqual(plain(401));
    const stranger = await everyRoute({ id: 'nobody' }, { post: mainId, target: camille.id });
    for (const route of ROUTES) expect(refusal(stranger[route]), route).toEqual(plain(401));
    await untouched();
  });

  const NOT_MODERATORS: [string, string | undefined][] = [
    ['a plain player', undefined],
    ['an events manager', 'events-manager'],
    ['an economy admin', 'economy-admin'],
    ['a feed announcer', 'feed-announcer'],
    ['an events manager and economy admin', 'events-manager,economy-admin'],
    ['a feed announcer with other roles', 'economy-admin,feed-announcer,events-manager'],
    ['a role that only looks like one', 'warden-administrator'],
    ['a role named in another case', 'Admin'],
    ['a role with the word inside another', 'not-admin'],
  ];

  for (const [label, role] of NOT_MODERATORS) {
    it(`answers 403 to every route for ${label}, and changes nothing`, async () => {
      const caller = await person(`Appelant ${label}`, { role });
      const answers = await everyRoute(caller, { post: mainId, target: camille.id });
      for (const route of ROUTES) {
        expect(refusal(answers[route]), route).toEqual(plain(403));
        expect(answers[route].body, route).toBeUndefined();
      }
      await untouched();
    });
  }

  it('refuses before it reads anything: no 400 or 404 tells a player what exists', async () => {
    const player = await person('Joueur');
    const gone = randomUUID();
    const answers: [string, HttpAnswer][] = [
      ['a bad filter', await admin.list(player, 'q=a')],
      ['a forged cursor', await admin.list(player, 'cursor=nope')],
      ['a filter on a real person', await admin.list(player, `user=${camille.id}&anonymous=true`)],
      ['a search for a real author', await admin.list(player, 'q=camille')],
      ['an unknown row', await admin.row(player, gone)],
      ['a real row', await admin.row(player, mainId)],
      ['a row with no UUID', await admin.row(player, 'nope')],
      ['an unknown delete', await admin.remove(player, gone)],
      ['a delete with a bad body', await admin.remove(player, mainId, { reason: 'x'.repeat(501) })],
      ['an unknown person', await admin.announcer(player, 'nobody')],
      ['a ghost', await admin.announcer(player, (await person('Fantôme', { ghost: true })).id)],
      ['a bad announcer body', await admin.setAnnouncer(player, camille.id, { announcer: 'yes' })],
      [
        'a moderator’s announcer',
        await admin.setAnnouncer(player, (await person('M', { role: 'admin' })).id, {
          announcer: false,
        }),
      ],
    ];
    for (const [label, answer] of answers) {
      expect(refusal(answer), label).toEqual(plain(403));
      expect(answer.body, label).toBeUndefined();
    }
    await untouched();
  });

  it('gives a player no count, no author, no existence: the refusal carries no data', async () => {
    const player = await person('Joueur');
    const events = await person('Équipe', { role: 'events-manager' });
    for (const caller of [player, events]) {
      for (const answer of Object.values(
        await everyRoute(caller, { post: mainId, target: camille.id }),
      )) {
        expect(JSON.stringify(answer.error ?? null)).not.toMatch(
          /summary|last30Days|Camille|authorUserId/,
        );
        expect(answer.error?.data).toBeUndefined();
      }
    }
  });

  it('lets a Warden admin and a site admin call every route, with other roles beside', async () => {
    for (const role of [
      'warden-admin',
      'admin',
      'events-manager,warden-admin',
      'admin,economy-admin',
    ]) {
      const moderator = await person(`Modo ${role}`, { role });
      const answers = await everyRoute(moderator, { post: mainId, target: camille.id });
      expect(answers.list.status, role).toBe(200);
      expect(answers.row.status, role).toBe(200);
      expect(answers.announcer.status, role).toBe(200);
      expect(answers.setAnnouncer.status, role).toBe(200);
      expect(answers.remove.status, role).toBe(204);
      // Put the world back for the next role.
      await db
        .update(feedPost)
        .set({ deletedAt: null, deletedCause: null })
        .where(eq(feedPost.threadId, mainId));
      await db
        .update(feedPost)
        .set({ deletedAt: null, deletedCause: null })
        .where(eq(feedPost.id, mainId));
      await admin.setAnnouncer(moderator, camille.id, { announcer: false });
    }
  });

  it('works whatever the Feed flags: the admin is never behind one', async () => {
    const moderator = await person('Lune', { role: 'warden-admin' });
    setFlags({ feed: false, 'feed.writing': false, 'feed.serverApi': false });
    const answers = await everyRoute(moderator, { post: mainId, target: camille.id });
    expect(Object.values(answers).map((answer) => answer.status)).toEqual([
      200, 200, 200, 200, 204,
    ]);
    // The browser's own routes are behind `feed`: the same moderator is refused there.
    expect(refusal(await api.page(moderator, 'feed=global'))).toEqual(
      problem(503, 'disabled', { flag: 'feed' }),
    );
  });

  describe('a moderator under a Warden ban', () => {
    let banned: Person;
    beforeEach(async () => {
      banned = await person('Lune bannie', { role: 'warden-admin' });
      await db.insert(wardenBan).values({ userId: banned.id, reason: 'Test', source: 'web' });
    });

    // Decided: the admin follows the role alone, as every other Warden page does (a banned Warden
    // admin keeps bans, notes, appeals, people and the activity log). Whether a Warden ban should
    // suspend the admin site-wide is the owner's question (docs/feed.md, Rights). In game and on
    // the Feed page the ban still removes moderate.
    it('still deletes anyone’s post from the admin, audited with the reason', async () => {
      expect((await admin.remove(banned, mainId, { reason: 'Spam' })).status).toBe(204);
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, mainId));
      expect(row).toMatchObject({ deletedCause: 'moderator', deletedReason: 'Spam' });
      const entries = await db
        .select()
        .from(audit)
        .where(eq(audit.action, 'minecraft.feed.delete'));
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorUserId: banned.id });
    });

    it('still sees the real author of an anonymous post in the admin', async () => {
      const answer = await admin.list(banned);
      expect(answer.status).toBe(200);
      const secret = listOf(answer).items.find((item) => item.id === mainId);
      expect(secret).toMatchObject({ anonymous: true, author: { uuid: camille.uuid } });
    });

    it('still opens a row', async () => {
      expect((await admin.row(banned, mainId)).status).toBe(200);
    });

    it('still gives and takes the announcer role', async () => {
      expect((await admin.setAnnouncer(banned, camille.id, { announcer: true })).status).toBe(200);
      expect((await admin.announcer(banned, camille.id)).body).toMatchObject({ announcer: true });
      expect((await admin.setAnnouncer(banned, camille.id, { announcer: false })).status).toBe(200);
    });

    it('loses the moderate right in game, where it cannot delete someone else’s post', async () => {
      await expect(
        feedPostService.remove({
          actor: { source: 'server', player: banned.uuid },
          postId: mainId,
        }),
      ).rejects.toMatchObject({ statusCode: 403, data: { problem: 'notAllowed' } });
      const [row] = await db.select().from(feedPost).where(eq(feedPost.id, mainId));
      expect(row!.deletedAt).toBeNull();
    });
  });
});

describe('the admin leaves the other views as they were', () => {
  beforeAll(() => {
    stubServerUtils();
    vi.stubGlobal('requireUser', requireTestUser);
    vi.stubGlobal('requireWardenAdmin', requireTestWardenAdmin);
  });
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps an anonymous author hidden from players, in the browser and in the game', async () => {
    const lune = await person('Lune Garnier', { role: 'warden-admin' });
    const camille = await person('Camille Roux');
    const kael = await person('Kaël Dubois');
    const { post: secret } = await post(camille, 'Secret', { anonymous: true });
    const { post: answer } = await reply(camille, secret.id, null, { anonymous: true });
    // The admin reads it all, and sets and takes a role.
    await admin.list(lune);
    await admin.row(lune, secret.id);
    await admin.setAnnouncer(lune, camille.id, { announcer: true });
    await admin.setAnnouncer(lune, camille.id, { announcer: false });
    const adminOnly = [
      'authorUserId',
      'source',
      'deletedAt',
      'deletedBy',
      'deletedCause',
      'deletedReason',
      'purgeAt',
    ];

    const page = (await api.page(kael, 'feed=global')).body as { posts: Record<string, unknown>[] };
    const thread = (await api.thread(kael, secret.id)).body as {
      post: Record<string, unknown>;
      replies: Record<string, unknown>[];
    };
    const game = await viewOf(kael, secret.id);
    const gameReply = await viewOf(kael, answer.id);
    for (const view of [page.posts[0]!, thread.post, thread.replies[0]!, game!, gameReply!]) {
      expect(view.anonymous).toBe(true);
      expect(view.author).toBeNull();
      for (const field of adminOnly) expect(view, field).not.toHaveProperty(field);
      expect(JSON.stringify(view)).not.toContain(camille.username);
      expect(JSON.stringify(view)).not.toContain('Camille');
    }
    // The role the admin set and unset left no announcer badge behind.
    expect(page.posts[0]).toMatchObject({ author: null });
  });

  it('does not make the browser’s answer to a moderator an admin shape', async () => {
    const lune = await person('Lune Garnier', { role: 'warden-admin' });
    const camille = await person('Camille Roux');
    await post(camille, 'Salut');
    const [seen] = (
      (await api.page(lune, 'feed=global')).body as { posts: Record<string, unknown>[] }
    ).posts;
    for (const field of ['authorUserId', 'source', 'deletedBy', 'purgeAt']) {
      expect(seen, field).not.toHaveProperty(field);
    }
  });

  it('reads leave no trace: no audit entry, no event', async () => {
    const lune = await person('Lune Garnier', { role: 'warden-admin' });
    const camille = await person('Camille Roux');
    const { post: secret } = await post(camille, 'Secret', { anonymous: true });
    const from = await latestEvent();
    const before = await db.select().from(audit);
    await admin.list(lune, 'anonymous=true&q=camille');
    await admin.row(lune, secret.id);
    await admin.announcer(lune, camille.id);
    expect(await db.select().from(audit)).toEqual(before);
    expect(await eventsSince(from)).toEqual([]);
  });
});
