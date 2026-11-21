import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  audit,
  changelogPost,
  changelogSeen,
  featureFlag,
  minecraftAccount,
  user,
} from '~~/server/db/schema';
import { changelogService } from '~~/server/services/changelog';
import { publicPost, serverPost } from '~~/server/services/changelog-views';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ADMIN = 'changelog-test-admin';
const PLAYER = 'changelog-test-player';
const UUID = '5c2a7a3e-0000-4000-8000-00000000c10a';
const DAY = 86_400_000;
const system = { source: 'system' as const };

async function wipe() {
  await db.delete(changelogPost);
  await db.delete(audit);
  await db.delete(minecraftAccount).where(eq(minecraftAccount.uuid, UUID));
  await db.delete(user).where(eq(user.id, PLAYER));
  await db.delete(featureFlag);
}

async function seedPlayer() {
  await db.insert(user).values({
    id: PLAYER,
    name: 'Player',
    email: 'changelog-player@epitech.eu',
    emailVerified: true,
    tenantId: EPITECH,
  } as typeof user.$inferInsert);
  await db.insert(minecraftAccount).values({ uuid: UUID, userId: PLAYER, username: 'Pl4yer' });
}

const post = (title = 'Season 4.2 is here', sourceLang: 'en' | 'fr' = 'en') =>
  changelogService.create({ sourceLang, source: { title, body: 'Body' } }, ADMIN);

describe('changelog service', () => {
  beforeEach(async () => {
    await wipe();
    await db
      .insert(user)
      .values({
        id: ADMIN,
        name: 'Admin',
        email: 'changelog-admin@epitech.eu',
        emailVerified: true,
        tenantId: EPITECH,
      } as typeof user.$inferInsert)
      .onConflictDoNothing();
  });
  afterAll(async () => {
    await wipe();
    await db.delete(user).where(eq(user.id, ADMIN));
  });

  it('creates a draft with a stable slug, unique per title', async () => {
    const a = await post('Été 2026 : nouveautés !', 'fr');
    const b = await post('Été 2026 : nouveautés !', 'fr');
    expect(a.slug).toBe('ete-2026-nouveautes');
    expect(b.slug).toBe('ete-2026-nouveautes-2');
    const edited = await changelogService.update(a.id, { source: { title: 'Autre' } }, ADMIN);
    expect(edited.slug).toBe(a.slug);
    expect(a.status).toBe('draft');
    expect(a.titleFr).toBe('Été 2026 : nouveautés !');
    expect(a.titleEn).toBeNull();
  });

  it('runs the lifecycle and audits it', async () => {
    const created = await post();
    const published = await changelogService.publish(created.id, { source: 'web', userId: ADMIN });
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeInstanceOf(Date);
    await changelogService.unpublish(created.id, ADMIN);
    const [row] = await db.select().from(changelogPost);
    expect(row).toMatchObject({ status: 'draft', publishedAt: null });
    const actions = (await db.select().from(audit)).map((entry) => entry.action).sort();
    expect(actions).toEqual([
      'minecraft.changelog.create',
      'minecraft.changelog.publish',
      'minecraft.changelog.unpublish',
    ]);
  });

  it('keeps a machine translation unreviewed until an editor saves it', async () => {
    const created = await post();
    const drafted = await changelogService.saveTranslation(
      created.id,
      { title: 'Saison 4.2', body: 'Corps' },
      ADMIN,
    );
    expect(drafted).toMatchObject({ titleFr: 'Saison 4.2', translationUnreviewed: true });
    const reviewed = await changelogService.update(
      created.id,
      { translation: { title: 'Saison 4.2 !', body: 'Corps' } },
      ADMIN,
    );
    expect(reviewed.translationUnreviewed).toBe(false);
    const actions = (await db.select().from(audit)).map((entry) => entry.action);
    expect(actions).toContain('minecraft.changelog.translate');
  });

  it('returns the asked language, or the source and says so', async () => {
    const created = await post('Hello');
    await changelogService.publish(created.id, system);
    expect(await changelogService.get({ id: created.id }, { lang: 'fr' })).toMatchObject({
      lang: 'en',
      title: 'Hello',
      hasTranslation: false,
    });
    await changelogService.saveTranslation(created.id, { title: 'Salut', body: 'Corps' }, ADMIN);
    expect(await changelogService.get({ slug: created.slug }, { lang: 'fr' })).toMatchObject({
      lang: 'fr',
      title: 'Salut',
    });
    expect((await changelogService.get({ id: created.id }, { lang: 'en' }))?.lang).toBe('en');
  });

  it('publishes scheduled posts once their date has passed', async () => {
    const now = new Date('2026-11-20T12:00:00Z');
    const due = await post('Due');
    const later = await post('Later');
    await changelogService.schedule(due.id, new Date(now.getTime() + 1000), ADMIN, now);
    await changelogService.schedule(later.id, new Date(now.getTime() + DAY), ADMIN, now);
    await expect(changelogService.schedule(due.id, now, ADMIN, now)).rejects.toBeTruthy();
    expect(await changelogService.publishDue(now)).toBe(0);
    const tick = new Date(now.getTime() + 60_000);
    expect(await changelogService.publishDue(tick)).toBe(1);
    expect(await changelogService.publishDue(tick)).toBe(0);
    const row = await changelogService.getRow(due.id);
    expect(row).toMatchObject({ status: 'published' });
    expect(row!.publishedAt!.getTime()).toBe(now.getTime() + 1000);
    expect((await changelogService.getRow(later.id))?.status).toBe('scheduled');
  });

  it('lists published posts newest first with a cursor, never drafts', async () => {
    const base = new Date('2026-11-01T00:00:00Z');
    for (let n = 0; n < 3; n++) {
      const created = await post('Post ' + String(n));
      await changelogService.publish(created.id, system, new Date(base.getTime() + n * DAY));
    }
    await post('Draft');
    const first = await changelogService.listPublished({ lang: 'en', limit: 2 });
    expect(first.posts.map((p) => p.title)).toEqual(['Post 2', 'Post 1']);
    const second = await changelogService.listPublished({
      lang: 'en',
      limit: 2,
      before: first.next!,
    });
    expect(second.posts.map((p) => p.title)).toEqual(['Post 0']);
    expect(second.next).toBeNull();
    expect(await changelogService.listAdmin()).toHaveLength(4);
  });

  it('finds the published posts just older and newer, and shows the public fields', async () => {
    const base = new Date('2026-11-01T10:00:00Z');
    const ids: string[] = [];
    for (const n of [0, 1, 2]) {
      const created = await post(`Post ${String(n)}`, n === 1 ? 'fr' : 'en');
      ids.push(created.id);
      await changelogService.publish(created.id, system, new Date(base.getTime() + n * DAY));
    }
    const draft = await post('Draft');
    const middle = (await changelogService.get({ slug: 'post-1' }, { publishedOnly: true }))!;
    const around = await changelogService.neighbours(middle, 'en');
    expect([around.older?.title, around.newer?.title]).toEqual(['Post 0', 'Post 2']);
    const newest = (await changelogService.get({ slug: 'post-2' }, { publishedOnly: true }))!;
    expect((await changelogService.neighbours(newest, 'en')).newer).toBeNull();
    // A draft is not published, so it has no public page.
    expect(await changelogService.get({ slug: draft.slug }, { publishedOnly: true })).toBeNull();
    // A French-only post asked in English comes back in French, with one language.
    expect(publicPost(middle)).toMatchObject({ lang: 'fr', languages: ['fr'], coverUrl: null });
  });

  it('offers the latest unseen post under 14 days old, and marks seen idempotently', async () => {
    await seedPlayer();
    const now = new Date('2026-11-20T12:00:00Z');
    const old = await post('Old');
    const recent = await post('Recent');
    await changelogService.publish(old.id, system, new Date(now.getTime() - 15 * DAY));
    expect(await changelogService.unseenFor(UUID, 'en', now)).toBeNull();
    await changelogService.publish(recent.id, system, new Date(now.getTime() - 13 * DAY));
    expect((await changelogService.unseenFor(UUID, 'en', now))?.title).toBe('Recent');
    await changelogService.markSeen(recent.id, UUID);
    await changelogService.markSeen(recent.id, UUID);
    expect(await db.select().from(changelogSeen)).toHaveLength(1);
    expect(await changelogService.unseenFor(UUID, 'en', now)).toBeNull();
    // A draft or unpublished post is never offered.
    await changelogService.unpublish(recent.id, ADMIN);
    expect(
      await changelogService.unseenFor('5c2a7a3e-0000-4000-8000-00000000c10b', 'en', now),
    ).toBeNull();
  });

  it('shows a post to the game with an absolute link and the Markdown body', async () => {
    process.env.BETTER_AUTH_SECRET ??= 'x'.repeat(32);
    process.env.BETTER_AUTH_URL ??= 'https://lnb.example.com';
    process.env.MICROSOFT_CLIENT_ID ??= 'id';
    process.env.MICROSOFT_CLIENT_SECRET ??= 'secret';
    process.env.AUTH_ALLOWED_TENANTS ??= EPITECH;
    const created = await post('Hello', 'en');
    await changelogService.publish(created.id, system);
    const found = await changelogService.get(
      { id: created.id },
      { lang: 'fr', publishedOnly: true },
    );
    expect(serverPost(found!)).toMatchObject({ id: created.id, lang: 'en' });
    expect(serverPost(found!).url).toMatch(/^https?:\/\/.+\/minecraft\/changelog\/hello$/);
    expect(found!.body).toBe('Body');
  });

  it('stores seen state for a UUID no account has linked', async () => {
    const created = await post();
    await changelogService.publish(created.id, system);
    const stranger = '5c2a7a3e-0000-4000-8000-00000000c10c';
    expect(await changelogService.unseenFor(stranger, 'en')).not.toBeNull();
    await changelogService.markSeen(created.id, stranger);
    await changelogService.markSeen(created.id, stranger);
    expect(await db.select().from(changelogSeen)).toHaveLength(1);
    expect(await changelogService.unseenFor(stranger, 'en')).toBeNull();
  });

  it('deletes the seen rows of the account, and only those', async () => {
    await seedPlayer();
    const created = await post();
    await changelogService.publish(created.id, system);
    await changelogService.markSeen(created.id, UUID);
    await changelogService.markSeen(created.id, '5c2a7a3e-0000-4000-8000-00000000c10c');
    expect(await db.select().from(changelogSeen)).toHaveLength(2);
    await db.transaction((tx) => changelogService.forgetUsers(tx, [PLAYER]));
    const left = await db.select().from(changelogSeen);
    expect(left.map((row) => row.minecraftUuid)).toEqual(['5c2a7a3e-0000-4000-8000-00000000c10c']);
  });
});
