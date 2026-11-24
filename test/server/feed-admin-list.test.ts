import { randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { feedPost } from '~~/server/db/schema';
import { feedPinService } from '~~/server/services/feed/pins';
import { feedLimits } from '~~/server/services/feed/shared';

import { admin, b64, detailOf, listOf, requireTestWardenAdmin } from './feed-admin-helpers';
import { plain, refusal, requireTestUser } from './feed-browser-helpers';
import { person, post, reply, setFlags, stubServerUtils, wipe } from './feed-helpers';
import type { Person } from './feed-helpers';

// The admin's table and drawer reads against the contract (docs/feed.md, "For the admin"): the
// filters alone and combined, the search and its literal characters, the person filter, the
// summary, the cursor across pages and across a deletion, and the detail of every kind of row.

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms);

async function setCreatedAt(id: string, at: Date) {
  await db.update(feedPost).set({ createdAt: at }).where(eq(feedPost.id, id));
}

const idsOf = async (as: Person, query = '') =>
  listOf(await admin.list(as, query))
    .items.map((item) => item.id)
    .sort();

describe('the admin listing', () => {
  let lune: Person;
  let camille: Person;

  beforeAll(() => {
    stubServerUtils();
    vi.stubGlobal('requireUser', requireTestUser);
    vi.stubGlobal('requireWardenAdmin', requireTestWardenAdmin);
  });
  beforeEach(async () => {
    await wipe();
    setFlags();
    vi.spyOn(feedLimits, 'check').mockResolvedValue();
    lune = await person('Lune Garnier', { role: 'warden-admin' });
    camille = await person('Camille Roux');
  });
  afterAll(async () => {
    await wipe();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('the filters', () => {
    it('answers an empty table with an empty summary', async () => {
      expect(listOf(await admin.list(lune))).toEqual({
        items: [],
        nextCursor: null,
        summary: { last30Days: 0, deleted: 0 },
      });
    });

    it('keeps both feeds by default, and one feed alone, in any order, with repeats', async () => {
      const { post: news } = await post(lune, 'Annonce', { feed: 'announcements' });
      const { post: chat } = await post(camille, 'Discussion');
      expect(await idsOf(lune)).toEqual([news.id, chat.id].sort());
      expect(await idsOf(lune, 'feeds=announcements')).toEqual([news.id]);
      expect(await idsOf(lune, 'feeds=global')).toEqual([chat.id]);
      expect(await idsOf(lune, 'feeds=global,announcements')).toEqual([news.id, chat.id].sort());
      expect(await idsOf(lune, 'feeds=global,global')).toEqual([chat.id]);
      expect(await idsOf(lune, 'feeds=global,')).toEqual([chat.id]);
    });

    it('filters each chip alone: replies, anonymous, deleted, a person', async () => {
      const { post: plainPost } = await post(camille, 'Simple');
      const { post: hidden } = await post(camille, 'Caché', { anonymous: true });
      const { post: answer } = await reply(lune, plainPost.id);
      const { post: hiddenAnswer } = await reply(camille, plainPost.id, null, { anonymous: true });
      const { post: gone } = await post(lune, 'Parti');
      await admin.remove(lune, gone.id);
      await admin.remove(lune, answer.id, { reason: 'Hors sujet' });
      const everyId = [plainPost, hidden, answer, hiddenAnswer, gone].map((row) => row.id).sort();
      expect(await idsOf(lune)).toEqual(everyId);
      expect(await idsOf(lune, 'replies=true')).toEqual([answer.id, hiddenAnswer.id].sort());
      expect(await idsOf(lune, 'anonymous=true')).toEqual([hidden.id, hiddenAnswer.id].sort());
      // Deleted rows: the reply deleted by the moderator, and the post (its own, so by its author).
      expect(await idsOf(lune, 'deleted=true')).toEqual([answer.id, gone.id].sort());
      expect(await idsOf(lune, `user=${camille.id}`)).toEqual(
        [plainPost.id, hidden.id, hiddenAnswer.id].sort(),
      );
      expect(await idsOf(lune, `user=${lune.id}`)).toEqual([answer.id, gone.id].sort());
    });

    it('combines every filter with the others', async () => {
      const ana = await person('Ana Lopez', { role: 'feed-announcer' });
      const { post: news } = await post(lune, 'Annonce du soir', { feed: 'announcements' });
      const { post: hiddenNews } = await post(ana, 'Annonce secrète', {
        feed: 'announcements',
        anonymous: true,
      });
      const { post: chat } = await post(camille, 'Discussion du soir');
      const { post: hiddenChat } = await post(camille, 'Discussion secrète', { anonymous: true });
      const { post: answer } = await reply(camille, news.id, null, { anonymous: true });
      await admin.remove(lune, hiddenChat.id, { reason: 'Spam' });
      await admin.remove(lune, hiddenNews.id);
      const cases: [string, string[]][] = [
        ['feeds=announcements&anonymous=true', [hiddenNews.id, answer.id]],
        ['feeds=global&anonymous=true', [hiddenChat.id]],
        ['feeds=announcements&replies=true', [answer.id]],
        ['feeds=global&replies=true', []],
        ['replies=true&anonymous=true', [answer.id]],
        ['replies=true&deleted=true', []],
        ['anonymous=true&deleted=true', [hiddenChat.id, hiddenNews.id]],
        ['feeds=global&anonymous=true&deleted=true', [hiddenChat.id]],
        ['feeds=announcements&anonymous=true&deleted=true', [hiddenNews.id]],
        [`user=${ana.id}&feeds=announcements`, [hiddenNews.id]],
        [`user=${camille.id}&feeds=announcements`, [answer.id]],
        [`user=${camille.id}&feeds=announcements&anonymous=true&replies=true`, [answer.id]],
        [`user=${lune.id}&anonymous=true`, []],
        ['q=soir&feeds=global', [chat.id]],
        ['q=soir&anonymous=true', []],
        ['q=secr&anonymous=true&deleted=true&feeds=announcements', [hiddenNews.id]],
        [`q=camille&user=${camille.id}&replies=true`, [answer.id]],
      ];
      for (const [query, expected] of cases) {
        expect(await idsOf(lune, query), query).toEqual([...expected].sort());
      }
    });

    it('lists no one else’s rows for a person who posted nothing, or who does not exist', async () => {
      await post(camille);
      const quiet = await person('Silencieux');
      expect(await idsOf(lune, `user=${quiet.id}`)).toEqual([]);
      expect(await idsOf(lune, 'user=nobody')).toEqual([]);
      expect(await idsOf(lune, `user=${'x'.repeat(100)}`)).toEqual([]);
    });

    it('shows live and deleted rows newest first, replies among the posts', async () => {
      const { post: first } = await post(camille, 'Un');
      const { post: second } = await post(camille, 'Deux');
      const { post: answer } = await reply(lune, first.id);
      await setCreatedAt(first.id, ago(3000));
      await setCreatedAt(second.id, ago(2000));
      await setCreatedAt(answer.id, ago(1000));
      await admin.remove(lune, second.id, { reason: 'Test' });
      expect(listOf(await admin.list(lune)).items.map((item) => item.id)).toEqual([
        answer.id,
        second.id,
        first.id,
      ]);
    });

    it('shows a pinned announcement as pinned, and an unpinned one not', async () => {
      const { post: news } = await post(lune, 'Épinglée', { feed: 'announcements' });
      const { post: other } = await post(lune, 'Libre', { feed: 'announcements' });
      await feedPinService.pin({ actor: { source: 'server', player: lune.uuid }, postId: news.id });
      const items = new Map(listOf(await admin.list(lune)).items.map((item) => [item.id, item]));
      expect(items.get(news.id)!.pinnedAt).not.toBeNull();
      expect(items.get(other.id)!.pinnedAt).toBeNull();
      await admin.remove(lune, news.id);
      expect(
        listOf(await admin.list(lune)).items.find((item) => item.id === news.id)!.pinnedAt,
      ).toBeNull();
    });
  });

  describe('the search', () => {
    it('finds a text, a Minecraft username and a real name, in any case', async () => {
      const kael = await person('Kaël Dubois');
      const { post: byText } = await post(camille, 'Un pillard au spawn');
      const { post: byKael } = await post(kael, 'Rien à voir');
      expect(await idsOf(lune, 'q=PILLARD')).toEqual([byText.id]);
      expect(await idsOf(lune, 'q=pillard+au+sp')).toEqual([byText.id]);
      expect(await idsOf(lune, `q=${kael.username.toUpperCase()}`)).toEqual([byKael.id]);
      expect(await idsOf(lune, `q=${kael.username.slice(1, 6)}`)).toEqual([byKael.id]);
      expect(await idsOf(lune, `q=${encodeURIComponent('kaël')}`)).toEqual([byKael.id]);
      expect(await idsOf(lune, 'q=dubois')).toEqual([byKael.id]);
      expect(await idsOf(lune, 'q=roux')).toEqual([byText.id]);
      expect(await idsOf(lune, 'q=introuvable')).toEqual([]);
    });

    it('finds an anonymous post by its real author, and a reply by its author', async () => {
      const { post: secret } = await post(camille, 'Mot de passe', { anonymous: true });
      const { post: answer } = await reply(camille, secret.id);
      expect(await idsOf(lune, 'q=camille')).toEqual([secret.id, answer.id].sort());
      expect(await idsOf(lune, `q=${camille.username}`)).toEqual([secret.id, answer.id].sort());
    });

    it('finds a hidden real name too: the admin searches the account, not the setting', async () => {
      const shy = await person('Hélène Martin', { showRealName: false });
      const { post: mine } = await post(shy, 'Discret');
      expect(await idsOf(lune, 'q=martin')).toEqual([mine.id]);
    });

    it('finds deleted rows as well', async () => {
      const { post: gone } = await post(camille, 'Supprimé bientôt');
      await admin.remove(lune, gone.id);
      expect(await idsOf(lune, 'q=bient%C3%B4t')).toEqual([gone.id]);
    });

    it('takes %, _ and \\ literally', async () => {
      const { post: percent } = await post(camille, '100% sûr');
      await post(camille, '100 sûr');
      const { post: under } = await post(camille, 'a_b');
      await post(camille, 'axb');
      const { post: slash } = await post(camille, 'C:\\temp');
      await post(camille, 'C:temp');
      const { post: both } = await post(camille, 'x\\%y');
      expect(await idsOf(lune, `q=${encodeURIComponent('0%')}`)).toEqual([percent.id]);
      expect(await idsOf(lune, `q=${encodeURIComponent('a_')}`)).toEqual([under.id]);
      expect(await idsOf(lune, `q=${encodeURIComponent('_b')}`)).toEqual([under.id]);
      expect(await idsOf(lune, `q=${encodeURIComponent(':\\')}`)).toEqual([slash.id]);
      expect(await idsOf(lune, `q=${encodeURIComponent('\\%')}`)).toEqual([both.id]);
      // Wildcards alone match nothing but themselves.
      expect(await idsOf(lune, `q=${encodeURIComponent('%%')}`)).toEqual([]);
      expect(await idsOf(lune, `q=${encodeURIComponent('__')}`)).toEqual([]);
      expect(await idsOf(lune, `q=${encodeURIComponent('\\\\')}`)).toEqual([]);
      expect(await idsOf(lune, `q=${encodeURIComponent('a%b')}`)).toEqual([]);
      expect(await idsOf(lune, `q=${encodeURIComponent('%a')}`)).toEqual([]);
    });

    it('takes quotes and SQL as text', async () => {
      const { post: quoted } = await post(camille, "l'été; DROP TABLE feed_post; --");
      expect(await idsOf(lune, `q=${encodeURIComponent("'été; DROP")}`)).toEqual([quoted.id]);
      expect(await idsOf(lune, `q=${encodeURIComponent("' OR 1=1 --")}`)).toEqual([]);
      expect(listOf(await admin.list(lune)).items).toHaveLength(1);
    });

    it('trims the search, needs 2 characters after trimming, and stops at 100', async () => {
      const { post: mine } = await post(camille, `Début ${'x'.repeat(94)}`);
      expect(await idsOf(lune, `q=${encodeURIComponent('  début  ')}`)).toEqual([mine.id]);
      expect((await admin.list(lune, `q=${'x'.repeat(100)}`)).status).toBe(200);
      for (const query of [
        'q=',
        'q=+',
        'q=+a+',
        'q=a',
        `q=${'x'.repeat(101)}`,
        `q=${'x'.repeat(2000)}`,
      ]) {
        expect(refusal(await admin.list(lune, query)), query).toEqual(plain(400));
      }
      // Padding does not count toward the 100: it is trimmed before the limit.
      expect(
        (await admin.list(lune, `q=${encodeURIComponent(` ${'x'.repeat(100)} `)}`)).status,
      ).toBe(200);
    });
  });

  describe('the summary', () => {
    it('counts the rows of the last 30 days and how many are deleted', async () => {
      const { post: fresh } = await post(camille, 'Récent');
      const { post: gone } = await post(camille, 'Supprimé');
      const { post: old } = await post(camille, 'Ancien');
      const { post: oldGone } = await post(camille, 'Ancien supprimé');
      await admin.remove(lune, gone.id);
      await admin.remove(lune, oldGone.id);
      await setCreatedAt(old.id, ago(31 * DAY));
      await setCreatedAt(oldGone.id, ago(45 * DAY));
      const answer = listOf(await admin.list(lune));
      // The old rows are listed, but not counted.
      expect(answer.items.map((item) => item.id).sort()).toEqual(
        [fresh.id, gone.id, old.id, oldGone.id].sort(),
      );
      expect(answer.summary).toEqual({ last30Days: 2, deleted: 1 });
    });

    it('counts a row just inside the 30 days, not one just outside', async () => {
      const { post: inside } = await post(camille, 'Dedans');
      const { post: outside } = await post(camille, 'Dehors');
      await setCreatedAt(inside.id, ago(30 * DAY - 60_000));
      await setCreatedAt(outside.id, ago(30 * DAY + 60_000));
      expect(listOf(await admin.list(lune)).summary).toEqual({ last30Days: 1, deleted: 0 });
    });

    it('follows the filters, and says the deleted ones when only they are asked', async () => {
      await post(lune, 'Annonce', { feed: 'announcements' });
      await post(camille, 'Discussion');
      const { post: gone } = await post(camille, 'Supprimé');
      const { post: goneNews } = await post(lune, 'Annonce partie', { feed: 'announcements' });
      await admin.remove(lune, gone.id);
      await admin.remove(lune, goneNews.id);
      const summary = async (query: string) => listOf(await admin.list(lune, query)).summary;
      expect(await summary('')).toEqual({ last30Days: 4, deleted: 2 });
      expect(await summary('feeds=announcements')).toEqual({ last30Days: 2, deleted: 1 });
      expect(await summary('feeds=global')).toEqual({ last30Days: 2, deleted: 1 });
      expect(await summary('deleted=true')).toEqual({ last30Days: 2, deleted: 2 });
      expect(await summary(`user=${camille.id}`)).toEqual({ last30Days: 2, deleted: 1 });
      expect(await summary('q=partie')).toEqual({ last30Days: 1, deleted: 1 });
      expect(await summary('q=rien-de-tel')).toEqual({ last30Days: 0, deleted: 0 });
    });

    it('does not depend on the page: every page of a long table answers the same summary', async () => {
      for (let i = 0; i < 53; i++) await post(camille, `P${String(i)}`);
      const first = listOf(await admin.list(lune));
      const second = listOf(await admin.list(lune, `cursor=${first.nextCursor!}`));
      expect(first.summary).toEqual({ last30Days: 53, deleted: 0 });
      expect(second.summary).toEqual(first.summary);
      expect(second.items).toHaveLength(3);
    });

    it('counts the replies that went with their thread as deleted rows', async () => {
      const { post: main } = await post(camille, 'Fil');
      await reply(lune, main.id);
      await reply(lune, main.id);
      await admin.remove(lune, main.id);
      expect(listOf(await admin.list(lune)).summary).toEqual({ last30Days: 3, deleted: 3 });
    });
  });

  describe('the cursor', () => {
    it('walks every row once, newest first, across pages of 50', async () => {
      const made: string[] = [];
      for (let i = 0; i < 120; i++) {
        const { post: row } = await post(camille, `P${String(i)}`);
        made.push(row.id);
      }
      // Spread over time, so the order is the date's.
      for (const [i, id] of made.entries()) await setCreatedAt(id, ago((200 - i) * 1000));
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const answer = listOf(await admin.list(lune, cursor ? `cursor=${cursor}` : ''));
        seen.push(...answer.items.map((item) => item.id));
        cursor = answer.nextCursor;
        pages++;
      } while (cursor && pages < 10);
      expect(pages).toBe(3);
      expect(seen).toEqual([...made].reverse());
    });

    it('ends exactly on a full page with no next page', async () => {
      for (let i = 0; i < 50; i++) await post(camille, `P${String(i)}`);
      const answer = listOf(await admin.list(lune));
      expect(answer.items).toHaveLength(50);
      expect(answer.nextCursor).toBeNull();
    });

    it('breaks ties on the same instant by ID, with no row lost or repeated at a page edge', async () => {
      const at = ago(5000);
      const ids: string[] = [];
      for (let i = 0; i < 60; i++) {
        const { post: row } = await post(camille, `T${String(i)}`);
        ids.push(row.id);
      }
      await db.update(feedPost).set({ createdAt: at }).where(inArray(feedPost.id, ids));
      const first = listOf(await admin.list(lune));
      const second = listOf(await admin.list(lune, `cursor=${first.nextCursor!}`));
      const seen = [...first.items, ...second.items].map((item) => item.id);
      expect(seen).toHaveLength(60);
      expect(new Set(seen).size).toBe(60);
      expect(seen).toEqual([...ids].sort().reverse());
    });

    it('keeps the second page whole when rows of the first page are deleted in between', async () => {
      const made: string[] = [];
      for (let i = 0; i < 70; i++) {
        const { post: row } = await post(camille, `P${String(i)}`);
        made.push(row.id);
      }
      for (const [i, id] of made.entries()) await setCreatedAt(id, ago((100 - i) * 1000));
      const first = listOf(await admin.list(lune));
      // Delete rows from the first page, from the cursor's own row, and from the second page.
      const edge = first.items.at(-1)!.id;
      await admin.remove(lune, first.items[0]!.id);
      await admin.remove(lune, edge);
      const onSecond = [...made].reverse()[60]!;
      await admin.remove(lune, onSecond, { reason: 'Entre deux pages' });
      const second = listOf(await admin.list(lune, `cursor=${first.nextCursor!}`));
      expect(second.items.map((item) => item.id)).toEqual([...made].reverse().slice(50));
      expect(second.items.find((item) => item.id === onSecond)).toMatchObject({
        deletedCause: 'moderator',
        deletedReason: 'Entre deux pages',
      });
      // The deleted rows did not leave the first page either.
      const again = listOf(await admin.list(lune));
      expect(again.items.map((item) => item.id)).toEqual(first.items.map((item) => item.id));
    });

    it('keeps the pages of a filtered table, with the cursor and the filters together', async () => {
      for (let i = 0; i < 55; i++) await post(camille, `Anon ${String(i)}`, { anonymous: true });
      for (let i = 0; i < 5; i++) await post(camille, `Public ${String(i)}`);
      const first = listOf(await admin.list(lune, 'anonymous=true'));
      expect(first.items).toHaveLength(50);
      const second = listOf(await admin.list(lune, `anonymous=true&cursor=${first.nextCursor!}`));
      expect(second.items).toHaveLength(5);
      expect(second.items.every((item) => item.anonymous)).toBe(true);
      expect(second.nextCursor).toBeNull();
    });

    it('answers a cursor at its own edge: nothing after the oldest row', async () => {
      const { post: only } = await post(camille);
      const row = (await db.select().from(feedPost).where(eq(feedPost.id, only.id)))[0]!;
      const after = b64([row.createdAt.getTime(), row.id]);
      expect(listOf(await admin.list(lune, `cursor=${after}`))).toMatchObject({
        items: [],
        nextCursor: null,
      });
      const before = b64([row.createdAt.getTime() + 1, row.id]);
      expect(listOf(await admin.list(lune, `cursor=${before}`)).items).toHaveLength(1);
    });

    it('refuses a forged cursor with a plain 400', async () => {
      for (const forged of [
        'cursor=%00',
        `cursor=${b64({ at: 0, id: randomUUID() })}`,
        `cursor=${b64([0])}`,
        `cursor=${b64(['2026-01-01', randomUUID()])}`,
        `cursor=${b64([1.5, randomUUID()])}`,
        `cursor=${b64([null, randomUUID()])}`,
        `cursor=${b64([0, randomUUID(), 'extra'])}`,
        `cursor=${Buffer.from('[0,"x"').toString('base64url')}`,
      ]) {
        expect(refusal(await admin.list(lune, forged)), forged).toEqual(plain(400));
      }
    });
  });

  describe('what a row carries', () => {
    it('shows the real author of an anonymous row, the source, and no viewer fields', async () => {
      const { post: secret } = await post(camille, 'Secret', { anonymous: true });
      const [item] = listOf(await admin.list(lune)).items;
      expect(item).toMatchObject({
        id: secret.id,
        anonymous: true,
        author: { uuid: camille.uuid, username: camille.username },
        authorUserId: camille.id,
        source: 'server',
        deletedAt: null,
        deletedBy: null,
        deletedCause: null,
        deletedReason: null,
        purgeAt: null,
      });
      for (const field of ['liked', 'mine', 'canDelete', 'canPin', 'unseenReplies', 'answersMe']) {
        expect(item, field).not.toHaveProperty(field);
      }
    });

    it('says who deleted a row, when it will be purged, and why a reply went', async () => {
      const { post: main } = await post(camille, 'Fil');
      const { post: answer } = await reply(camille, main.id);
      const { post: own } = await post(camille, 'À moi');
      const { post: hers } = await post(camille, 'À elle');
      await admin.remove(lune, hers.id, { reason: 'Raison' });
      await admin.remove(lune, main.id);
      // The author deletes their own through the browser's route.
      const { api } = await import('./feed-browser-helpers');
      expect((await api.remove(camille, own.id)).status).toBe(204);
      const items = new Map(listOf(await admin.list(lune)).items.map((item) => [item.id, item]));
      expect(items.get(hers.id)).toMatchObject({
        deletedCause: 'moderator',
        deletedBy: { userId: lune.id, name: 'Lune Garnier' },
        deletedReason: 'Raison',
      });
      expect(items.get(main.id)).toMatchObject({ deletedCause: 'moderator', deletedReason: null });
      expect(items.get(answer.id)).toMatchObject({
        deletedCause: 'thread',
        deletedBy: null,
        deletedReason: null,
      });
      expect(items.get(own.id)).toMatchObject({
        deletedCause: 'author',
        deletedBy: null,
        deletedReason: null,
      });
      for (const item of items.values()) {
        const at = Date.parse(item.deletedAt!);
        expect(Date.parse(item.purgeAt!) - at, item.id).toBe(30 * DAY);
      }
    });

    it('carries the reply-to line of a reply to a reply, and none for a reply to the post', async () => {
      const kael = await person('Kaël Dubois');
      const { post: main } = await post(camille, 'Fil');
      const { post: first } = await reply(kael, main.id);
      const { post: second } = await reply(camille, main.id, first.id);
      const { post: hiddenFirst } = await reply(kael, main.id, null, { anonymous: true });
      const { post: third } = await reply(camille, main.id, hiddenFirst.id);
      const items = new Map(listOf(await admin.list(lune)).items.map((item) => [item.id, item]));
      expect(items.get(first.id)).toMatchObject({ threadId: main.id, replyTo: null });
      expect(items.get(second.id)!.replyTo).toMatchObject({ id: first.id, name: 'Kaël D.' });
      expect(items.get(third.id)!.replyTo).toMatchObject({ id: hiddenFirst.id, anonymous: true });
      expect(items.get(third.id)!.replyTo!.name).toBeNull();
    });

    it('names a person who hides their real name by their username only', async () => {
      const shy = await person('Hélène Martin', { showRealName: false });
      await post(shy, 'Discret');
      const [item] = listOf(await admin.list(lune)).items;
      expect(item!.author).toMatchObject({
        uuid: shy.uuid,
        username: shy.username,
        realName: null,
      });
    });

    it('shows each of a person’s linked accounts as the one that posted', async () => {
      const twin = await person('Jumeau Deux', { accounts: 2 });
      const { post: fromFirst } = await post(twin.accounts[0]!, 'Du premier');
      const { post: fromSecond } = await post(twin.accounts[1]!, 'Du second');
      const items = new Map(listOf(await admin.list(lune)).items.map((item) => [item.id, item]));
      expect(items.get(fromFirst.id)!.author.username).toBe(twin.accounts[0]!.username);
      expect(items.get(fromSecond.id)!.author.username).toBe(twin.accounts[1]!.username);
      expect(items.get(fromSecond.id)!.authorUserId).toBe(twin.id);
    });
  });

  describe('the detail of a row', () => {
    it('opens a main post with its whole thread, deleted replies marked, oldest first', async () => {
      const { post: main } = await post(camille, 'Fil');
      const made: string[] = [];
      for (let i = 0; i < 5; i++) made.push((await reply(camille, main.id)).post.id);
      for (const [i, id] of made.entries()) await setCreatedAt(id, ago((10 - i) * 1000));
      await admin.remove(lune, made[1]!);
      const detail = detailOf(await admin.row(lune, main.id));
      expect(detail.post.id).toBe(main.id);
      expect(detail.thread.post.id).toBe(main.id);
      expect(detail.thread.replies.map((item) => item.id)).toEqual(made);
      expect(detail.thread.replies.map((item) => item.deletedAt !== null)).toEqual([
        false,
        true,
        false,
        false,
        false,
      ]);
    });

    it('opens a reply with its main post, and the row is the reply', async () => {
      const kael = await person('Kaël Dubois');
      const { post: main } = await post(camille, 'Fil', { anonymous: true });
      const { post: first } = await reply(kael, main.id);
      const { post: second } = await reply(camille, main.id, first.id);
      const detail = detailOf(await admin.row(lune, second.id));
      expect(detail.post).toMatchObject({ id: second.id, threadId: main.id });
      expect(detail.post.replyTo).toMatchObject({ id: first.id });
      expect(detail.thread.post).toMatchObject({ id: main.id, anonymous: true });
      expect(detail.thread.replies.map((item) => item.id)).toEqual([first.id, second.id]);
    });

    it('shows the real author of an anonymous row and of an anonymous main post', async () => {
      const { post: main } = await post(camille, 'Fil', { anonymous: true });
      const { post: answer } = await reply(camille, main.id, null, { anonymous: true });
      for (const id of [main.id, answer.id]) {
        const detail = detailOf(await admin.row(lune, id));
        for (const row of [detail.post, detail.thread.post, ...detail.thread.replies]) {
          expect(row.author, row.id).toMatchObject({
            uuid: camille.uuid,
            username: camille.username,
          });
          expect(row.authorUserId, row.id).toBe(camille.id);
          expect(row.anonymous, row.id).toBe(true);
        }
      }
    });

    it('opens a deleted post and a deleted reply, with who, why and the purge date', async () => {
      const { post: main } = await post(camille, 'Fil');
      const { post: answer } = await reply(camille, main.id);
      await admin.remove(lune, answer.id, { reason: 'Insulte' });
      const reopened = detailOf(await admin.row(lune, answer.id));
      expect(reopened.post).toMatchObject({
        deletedCause: 'moderator',
        deletedBy: { userId: lune.id, name: 'Lune Garnier' },
        deletedReason: 'Insulte',
      });
      expect(Date.parse(reopened.post.purgeAt!) - Date.parse(reopened.post.deletedAt!)).toBe(
        30 * DAY,
      );
      await admin.remove(lune, main.id);
      const whole = detailOf(await admin.row(lune, answer.id));
      expect(whole.thread.post.deletedCause).toBe('moderator');
      // The reply deleted first keeps its own cause.
      expect(whole.post.deletedCause).toBe('moderator');
    });

    it('opens a reply that went with its thread, with no one named', async () => {
      const { post: main } = await post(camille, 'Fil');
      const { post: answer } = await reply(camille, main.id);
      await admin.remove(lune, main.id);
      const detail = detailOf(await admin.row(lune, answer.id));
      expect(detail.post).toMatchObject({ deletedCause: 'thread', deletedBy: null });
      expect(detail.thread.replies.map((item) => item.id)).toEqual([answer.id]);
    });

    it('opens a post an author deleted, naming no moderator', async () => {
      const { post: own } = await post(camille, 'À moi');
      const { api } = await import('./feed-browser-helpers');
      await api.remove(camille, own.id);
      const detail = detailOf(await admin.row(lune, own.id));
      expect(detail.post).toMatchObject({ deletedCause: 'author', deletedBy: null });
    });

    it('answers notFound for an unknown ID, and a plain 404 for no UUID', async () => {
      expect(refusal(await admin.row(lune, randomUUID()))).toMatchObject({
        status: 404,
        data: { problem: 'notFound' },
      });
      for (const id of ['', ' ', 'null', 'undefined', '1', randomUUID().toUpperCase() + '0']) {
        expect(refusal(await admin.row(lune, id)).status, id).toBe(404);
      }
    });
  });
});
