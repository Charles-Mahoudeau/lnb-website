import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import {
  adminAudit,
  featureFlag,
  rule,
  ruleCategory,
  user,
  wardenAudit,
  wardenBan,
  wardenNote,
} from '~~/server/db/schema';
import { flagService } from '~~/server/services/flags';
import { ruleService } from '~~/server/services/rules';
import { wardenModerationService } from '~~/server/services/warden/moderation';

// The anticheat reaches the mod catalog, which caches through Nitro.
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
  useStorage: () => ({}),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ADMIN = 'rules-test-admin';
const PLAYER = 'rules-test-player';
const actor = { source: 'web' as const, userId: ADMIN };

async function problemOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { data?: { problem?: unknown } }).data?.problem;
  }
  return undefined;
}

async function wipe() {
  await db.delete(wardenNote).where(eq(wardenNote.userId, PLAYER));
  await db.delete(wardenBan).where(eq(wardenBan.userId, PLAYER));
  await db.delete(rule);
  await db.delete(ruleCategory);
  await db.delete(featureFlag);
}

/** Two categories, three rules: 1.1 and 1.2 in the first, 2.1 in the second. */
async function twoCategories() {
  const first = await ruleService.createCategory({
    actorId: ADMIN,
    body: { icon: 'heart-handshake', name: { en: 'Respect', fr: 'Respect' } },
  });
  const second = await ruleService.createCategory({
    actorId: ADMIN,
    body: { icon: 'shield-check', name: { en: 'Cheating', fr: '' } },
  });
  const make = (categoryId: string, en: string, fr = '') =>
    ruleService.createRule({
      actorId: ADMIN,
      body: { categoryId, title: { en, fr }, text: { en: `${en} text`, fr: '' } },
    });
  const a = await make(first.id, 'Be kind', 'Soyez gentil');
  const b = await make(first.id, 'No spam');
  const c = await make(second.id, 'No cheating');
  return { first, second, a, b, c };
}

beforeEachSetup();
function beforeEachSetup() {
  beforeEach(async () => {
    await db
      .insert(user)
      .values([
        { id: ADMIN, name: 'Ada Lovelace', email: `${ADMIN}@epitech.eu`, tenantId: EPITECH },
        { id: PLAYER, name: 'Pat Player', email: `${PLAYER}@epitech.eu`, tenantId: EPITECH },
      ])
      .onConflictDoNothing();
    await wipe();
  });
  afterAll(async () => {
    await wipe();
    await db.delete(wardenAudit).where(eq(wardenAudit.targetUserId, PLAYER));
    await db.delete(adminAudit).where(eq(adminAudit.actorUserId, ADMIN));
  });
}

describe('the rules page data', () => {
  it('numbers rules from their order and keeps both languages', async () => {
    await twoCategories();
    const view = await ruleService.listPublic();
    expect(view.enabled).toBe(true);
    expect(view.categories.map((c) => c.number)).toEqual([1, 2]);
    expect(view.categories[0]!.rules.map((r) => r.number)).toEqual(['1.1', '1.2']);
    expect(view.categories[0]!.rules[0]!.title).toEqual({ en: 'Be kind', fr: 'Soyez gentil' });
    expect(view.categories[1]!.rules[0]!.number).toBe('2.1');
    expect(view.updatedAt).not.toBeNull();
  });

  it('is empty, but still enabled, with no rule', async () => {
    expect(await ruleService.listPublic()).toEqual({
      enabled: true,
      updatedAt: null,
      categories: [],
    });
  });

  it('answers with enabled false and nothing else while the flag is off', async () => {
    await twoCategories();
    await flagService.set({ key: 'rules', enabled: false, actorId: ADMIN });
    const off = await ruleService.listPublic();
    // The flag's cache is shared by the tests that follow, so switch it back on first.
    await flagService.set({ key: 'rules', enabled: true, actorId: ADMIN });
    expect(off).toEqual({ enabled: false, updatedAt: null, categories: [] });
    expect((await ruleService.listAdmin()).categories).toHaveLength(2);
    expect((await ruleService.listForServer('en')).categories).toHaveLength(2);
  });

  it('leaves out categories with no rule that is not retired', async () => {
    const { second, c } = await twoCategories();
    await ruleService.setRetired({ actorId: ADMIN, id: c.id, retired: true });
    const view = await ruleService.listPublic();
    expect(view.categories.map((cat) => cat.id)).not.toContain(second.id);
    expect(view.categories).toHaveLength(1);
  });
});

describe('moving and retiring', () => {
  it('moves a rule inside its category, and ignores the ends', async () => {
    const { a, b } = await twoCategories();
    await ruleService.moveRule(b.id, 'up');
    let first = (await ruleService.listPublic()).categories[0]!;
    expect(first.rules.map((r) => r.id)).toEqual([b.id, a.id]);
    await ruleService.moveRule(b.id, 'up');
    first = (await ruleService.listPublic()).categories[0]!;
    expect(first.rules.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it('steps over a retired neighbour so a move changes what shows', async () => {
    const first = await ruleService.createCategory({
      actorId: ADMIN,
      body: { icon: 'box', name: { en: 'One', fr: '' } },
    });
    const make = (en: string) =>
      ruleService.createRule({
        actorId: ADMIN,
        body: { categoryId: first.id, title: { en, fr: '' }, text: { en, fr: '' } },
      });
    const a = await make('A');
    const b = await make('B');
    const c = await make('C');
    await ruleService.setRetired({ actorId: ADMIN, id: b.id, retired: true });
    await ruleService.moveRule(c.id, 'up');
    const shown = (await ruleService.listPublic()).categories[0]!.rules.map((r) => r.id);
    expect(shown).toEqual([c.id, a.id]);
  });

  it('moves a category, and numbers follow', async () => {
    const { first, second } = await twoCategories();
    await ruleService.moveCategory(second.id, 'up');
    const view = await ruleService.listPublic();
    expect(view.categories.map((c) => c.id)).toEqual([second.id, first.id]);
    expect(view.categories[0]!.rules[0]!.number).toBe('1.1');
  });

  it('retires and restores a rule, restoring it last in its category', async () => {
    const { a, b } = await twoCategories();
    await ruleService.setRetired({ actorId: ADMIN, id: a.id, retired: true });
    let admin = await ruleService.listAdmin();
    expect(admin.categories[0]!.rules.find((r) => r.id === a.id)).toMatchObject({
      retired: true,
      number: null,
    });
    expect(admin.categories[0]!.rules.find((r) => r.id === b.id)!.number).toBe('1.1');
    await ruleService.setRetired({ actorId: ADMIN, id: a.id, retired: false });
    admin = await ruleService.listAdmin();
    expect(admin.categories[0]!.rules.filter((r) => !r.retired).map((r) => r.id)).toEqual([
      b.id,
      a.id,
    ]);
  });

  it('keeps the anchor ref of a rule when it moves to another category', async () => {
    const { a, second } = await twoCategories();
    const before = (await ruleService.listAdmin()).categories[0]!.rules[0]!.ref;
    await ruleService.updateRule({ actorId: ADMIN, id: a.id, patch: { categoryId: second.id } });
    const moved = (await ruleService.listAdmin()).categories[1]!.rules.find((r) => r.id === a.id)!;
    expect(moved.ref).toBe(before);
    expect(moved.number).toBe('2.2');
  });
});

describe('categories', () => {
  it('refuses to delete a category that holds a rule, retired or not', async () => {
    const { first, a, b } = await twoCategories();
    expect(await problemOf(ruleService.removeCategory({ actorId: ADMIN, id: first.id }))).toBe(
      'categoryNotEmpty',
    );
    await ruleService.setRetired({ actorId: ADMIN, id: a.id, retired: true });
    await ruleService.setRetired({ actorId: ADMIN, id: b.id, retired: true });
    expect(await problemOf(ruleService.removeCategory({ actorId: ADMIN, id: first.id }))).toBe(
      'categoryNotEmpty',
    );
  });

  it('deletes an empty one', async () => {
    const empty = await ruleService.createCategory({
      actorId: ADMIN,
      body: { icon: 'leaf', name: { en: 'Empty', fr: '' } },
    });
    await ruleService.removeCategory({ actorId: ADMIN, id: empty.id });
    expect((await ruleService.listAdmin()).categories).toEqual([]);
  });

  it('answers 404 for an unknown category or rule', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect(
      await problemOf(
        ruleService.createRule({
          actorId: ADMIN,
          body: { categoryId: missing, title: { en: 'x', fr: '' }, text: { en: 'x', fr: '' } },
        }),
      ),
    ).toBe('categoryNotFound');
    expect(
      await problemOf(
        ruleService.updateRule({
          actorId: ADMIN,
          id: missing,
          patch: { title: { en: 'x', fr: '' } },
        }),
      ),
    ).toBe('ruleNotFound');
  });
});

describe('the draft', () => {
  it('fills an empty list with 14 rules in 5 categories, once', async () => {
    expect(await ruleService.loadDraft({ actorId: ADMIN })).toEqual({ rules: 14 });
    const admin = await ruleService.listAdmin();
    expect(admin.categories).toHaveLength(5);
    expect(admin.categories.every((c) => c.rules.every((r) => r.title.fr && r.text.fr))).toBe(true);
    expect(await problemOf(ruleService.loadDraft({ actorId: ADMIN }))).toBe('alreadyLoaded');
  });
});

describe('the Minecraft server view', () => {
  it('gives plain text in the language asked, falling back to English', async () => {
    const { a } = await twoCategories();
    const fr = await ruleService.listForServer('fr');
    expect(fr.lang).toBe('fr');
    expect(fr.categories[0]!.rules[0]).toMatchObject({
      id: a.id,
      number: '1.1',
      title: 'Soyez gentil',
    });
    expect(fr.categories[0]!.rules[1]!.title).toBe('No spam');
    expect(fr.categories[1]!.name).toBe('Cheating');
    const en = await ruleService.listForServer('en');
    expect(en.categories[0]!.rules[0]!.title).toBe('Be kind');
  });
});

describe('citations in sanctions', () => {
  it('keeps the number and title a ban named, whatever happens to the rule later', async () => {
    const { a, c } = await twoCategories();
    const ban = await wardenModerationService.ban({
      userId: PLAYER,
      body: { reason: 'Cheating', durationSeconds: null, ruleIds: [c.id, a.id, c.id] },
      actor,
    });
    expect(ban.rules.map((r) => [r.number, r.title.en])).toEqual([
      ['2.1', 'No cheating'],
      ['1.1', 'Be kind'],
    ]);
    await ruleService.updateRule({
      actorId: ADMIN,
      id: c.id,
      patch: { title: { en: 'Changed', fr: '' } },
    });
    await ruleService.setRetired({ actorId: ADMIN, id: a.id, retired: true });
    const [stored] = await db.select().from(wardenBan).where(eq(wardenBan.userId, PLAYER));
    expect(stored!.ruleCitations.map((r) => [r.number, r.title.en])).toEqual([
      ['2.1', 'No cheating'],
      ['1.1', 'Be kind'],
    ]);
  });

  it('names rules in a warning, and a sanction with none keeps an empty list', async () => {
    const { b } = await twoCategories();
    const warning = await wardenModerationService.addNote({
      userId: PLAYER,
      body: { kind: 'warning', body: 'Stop', ruleIds: [b.id] },
      actor,
    });
    expect(warning.rules).toHaveLength(1);
    expect(warning.rules[0]).toMatchObject({ ruleId: b.id, number: '1.2' });
    const plain = await wardenModerationService.addNote({
      userId: PLAYER,
      body: { kind: 'note', body: 'Private' },
      actor,
    });
    expect(plain.rules).toEqual([]);
  });

  it('refuses a retired or unknown rule, and writes nothing', async () => {
    const { a } = await twoCategories();
    await ruleService.setRetired({ actorId: ADMIN, id: a.id, retired: true });
    const body = { reason: 'x', durationSeconds: null, ruleIds: [a.id] };
    expect(await problemOf(wardenModerationService.ban({ userId: PLAYER, body, actor }))).toBe(
      'ruleNotFound',
    );
    expect(
      await problemOf(
        wardenModerationService.addNote({
          userId: PLAYER,
          body: { kind: 'warning', body: 'x', ruleIds: ['00000000-0000-4000-8000-000000000000'] },
          actor,
        }),
      ),
    ).toBe('ruleNotFound');
    expect(await db.select().from(wardenBan).where(eq(wardenBan.userId, PLAYER))).toEqual([]);
    expect(await db.select().from(wardenNote).where(eq(wardenNote.userId, PLAYER))).toEqual([]);
  });

  it('counts the sanctions that name each rule', async () => {
    const { a, b } = await twoCategories();
    await wardenModerationService.ban({
      userId: PLAYER,
      body: { reason: 'x', durationSeconds: 60, ruleIds: [a.id] },
      actor,
    });
    await wardenModerationService.addNote({
      userId: PLAYER,
      body: { kind: 'warning', body: 'x', ruleIds: [a.id, b.id] },
      actor,
    });
    const rules = (await ruleService.listAdmin()).categories[0]!.rules;
    expect(rules.find((r) => r.id === a.id)!.citations).toBe(2);
    expect(rules.find((r) => r.id === b.id)!.citations).toBe(1);
  });
});
