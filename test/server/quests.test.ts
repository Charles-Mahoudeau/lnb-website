import { randomUUID } from 'node:crypto';

import { and, eq, notInArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  economyAccount,
  economyMailboxItem,
  economySettings,
  economyTransaction,
  minecraftAccount,
  quest,
  questCommunity,
  questCompletion,
  questDailyDraw,
  questIndexDay,
  questSettingsRow,
  user,
} from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { economyAdminService } from '~~/server/services/economy/admin';
import { economyServerService } from '~~/server/services/economy/server';
import { questAdminService } from '~~/server/services/quests/admin';
import { communityService } from '~~/server/services/quests/community';
import { questDailyService } from '~~/server/services/quests/daily';
import { parisDay, previousDay } from '~~/server/services/quests/formula';
import { questPublicService } from '~~/server/services/quests/public';
import { questServerService } from '~~/server/services/quests/server';
import { currentSeason } from '~~/server/services/quests/shared';

// Quests: the catalogue, tiers and claims, server ranks, flash races, community quests, the
// index and the cap. See docs/quests.md.

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
let counter = 0;

/** An Epitech player with a linked Minecraft account and `balance` LNBits. */
async function player(balance = 1000) {
  const n = ++counter;
  const id = `quests-${String(n)}-${String(Date.now())}`;
  const username = `Qst${String(Date.now() % 100000)}x${String(n)}`.slice(0, 16);
  const uuid = offlineUuid(username);
  await db
    .insert(user)
    .values({ id, name: 'Quest Tester', email: `${id}@epitech.eu`, tenantId: EPITECH });
  await db.insert(minecraftAccount).values({ uuid, userId: id, username });
  await db
    .update(economySettings)
    .set({ startingBalance: balance })
    .where(eq(economySettings.id, 1));
  await economyServerService.lookup(uuid);
  return { id, uuid, username };
}

async function balanceOf(userId: string) {
  const [row] = await db
    .select({ balance: economyAccount.balance })
    .from(economyAccount)
    .where(eq(economyAccount.ownerUserId, userId));
  return row?.balance ?? 0;
}

const suffix = () => `${String(++counter)}_${String(Date.now() % 1_000_000)}`;

function individual(id: string) {
  return {
    id,
    family: 'individual',
    category: 'mining',
    name: { fr: 'Casseur de pierre', en: 'Stone breaker' },
    icon: 'minecraft:stone',
    objective: { type: 'mine', target: 'minecraft:stone' },
    tiers: [
      { amount: 1000, reward: 50 },
      {
        amount: 10_000,
        reward: 1000,
        items: [
          {
            id: 'minecraft:diamond',
            snbt: '{id:"minecraft:diamond",count:1}',
            name: 'Diamond',
            count: 1,
          },
        ],
      },
    ],
  };
}

function serverQuest(id: string) {
  return {
    id,
    family: 'server',
    name: { fr: 'Plus profond', en: 'Deeper' },
    icon: 'minecraft:netherrack',
    objective: { type: 'advancement' },
    advancement: 'minecraft:story/enter_the_nether',
    tier: 'rare',
    reward: 1000,
  };
}

function flashQuest(id: string) {
  return {
    id,
    family: 'flash',
    name: { fr: 'Pêche éclair', en: 'Quick fishing' },
    icon: 'minecraft:cod',
    objective: { type: 'fish' },
    range: { min: 5, max: 12 },
    rewardPerUnit: 4,
  };
}

beforeEach(async () => {
  // No index yet (Kglobal 1, I = I0 = 1000) and no cap, unless a test sets one.
  await db.delete(questIndexDay);
  await db
    .insert(questSettingsRow)
    .values({ id: 1, values: { cap: { percent: 0 } } })
    .onConflictDoUpdate({ target: questSettingsRow.id, set: { values: { cap: { percent: 0 } } } });
});

afterEach(async () => {
  await db.update(economySettings).set({ startingBalance: 0 }).where(eq(economySettings.id, 1));
});

describe('catalogue', () => {
  it('adds unknown quests and keeps the ones the site already has', async () => {
    const id = `mine_${suffix()}`;
    const first = await questServerService.seedCatalog({ quests: [individual(id)] });
    expect(first.added).toEqual([id]);
    const again = await questServerService.seedCatalog({
      quests: [{ ...individual(id), name: { fr: 'Autre', en: 'Other' } }],
    });
    expect(again).toEqual({ added: [], kept: [id], categoriesAdded: [] });
    const config = await questServerService.config();
    const quest = config.quests.find((entry) => (entry as { id: string }).id === id) as {
      name: { fr: string };
    };
    expect(quest.name.fr).toBe('Casseur de pierre');
  });

  it('refuses a malformed quest with a 400', async () => {
    await expect(
      questServerService.seedCatalog({ quests: [{ id: 'x', family: 'individual' }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('individual tiers', () => {
  it('freezes the amount, needs the tiers in order, and pays once on claim', async () => {
    const id = `mine_${suffix()}`;
    await questServerService.seedCatalog({ quests: [individual(id)] });
    const who = await player(250);

    await expect(
      questServerService.complete({
        idempotencyKey: randomUUID(),
        player: who.uuid,
        quest: id,
        tier: 2,
      }),
    ).rejects.toMatchObject({ data: { problem: 'tierLocked' } });

    const key = randomUUID();
    const done = await questServerService.complete({
      idempotencyKey: key,
      player: who.uuid,
      quest: id,
      tier: 1,
    });
    // 50 × Kglobal 1 × Kplayer (1 + 0.5 × (1 − 250 / 1000)) = 50 × 1.375 = 68.75
    expect(done.amount).toBe(69);
    expect(done.claimable).toBe(true);
    const replay = await questServerService.complete({
      idempotencyKey: key,
      player: who.uuid,
      quest: id,
      tier: 1,
    });
    expect(replay).toMatchObject({ replayed: true, completionId: done.completionId });
    await expect(
      questServerService.complete({
        idempotencyKey: randomUUID(),
        player: who.uuid,
        quest: id,
        tier: 1,
      }),
    ).rejects.toMatchObject({ data: { problem: 'alreadyCompleted' } });

    const claimKey = randomUUID();
    const paid = await questServerService.claimFromServer(done.completionId, {
      idempotencyKey: claimKey,
      player: who.uuid,
    });
    expect(paid.amount).toBe(69);
    expect(paid.transactionId).not.toBeNull();
    expect(await balanceOf(who.id)).toBe(250 + 69);
    const [tx] = await db
      .select()
      .from(economyTransaction)
      .where(eq(economyTransaction.id, paid.transactionId!));
    expect(tx).toMatchObject({ kind: 'mint', reason: 'questReward' });

    const again = await questServerService.claimFromServer(done.completionId, {
      idempotencyKey: claimKey,
      player: who.uuid,
    });
    expect(again.replayed).toBe(true);
    expect(await balanceOf(who.id)).toBe(250 + 69);
    await expect(
      questServerService.claim(done.completionId, {
        idempotencyKey: randomUUID(),
        userId: who.id,
        actor: { source: 'web' },
      }),
    ).rejects.toMatchObject({ data: { problem: 'alreadyClaimed' } });
  });

  it('keeps a paid completion when the economy is reset', async () => {
    const id = `mine_${suffix()}`;
    await questServerService.seedCatalog({ quests: [individual(id)] });
    const who = await player(250);
    const done = await questServerService.complete({
      idempotencyKey: randomUUID(),
      player: who.uuid,
      quest: id,
      tier: 1,
    });
    await questServerService.claimFromServer(done.completionId, {
      idempotencyKey: randomUUID(),
      player: who.uuid,
    });
    await economyAdminService.reset(who.id, 'reset the economy');
    const [row] = await db
      .select()
      .from(questCompletion)
      .where(eq(questCompletion.id, done.completionId));
    expect(row?.claimedAt).not.toBeNull();
    expect(row?.transactionId).toBeNull();
  });

  it('gives the tier items through the mailbox on claim', async () => {
    const id = `mine_${suffix()}`;
    await questServerService.seedCatalog({ quests: [individual(id)] });
    const who = await player(5000);
    await questServerService.complete({
      idempotencyKey: randomUUID(),
      player: who.uuid,
      quest: id,
      tier: 1,
    });
    const second = await questServerService.complete({
      idempotencyKey: randomUUID(),
      player: who.uuid,
      quest: id,
      tier: 2,
    });
    expect(second.amount).toBe(1000);
    const paid = await questServerService.claim(second.completionId, {
      idempotencyKey: randomUUID(),
      userId: who.id,
      actor: { source: 'web' },
    });
    expect(paid.mailboxItems).toBe(1);
    const items = await db
      .select()
      .from(economyMailboxItem)
      .where(eq(economyMailboxItem.userId, who.id));
    expect(items).toMatchObject([{ reason: 'questReward', itemId: 'minecraft:diamond', count: 1 }]);
  });

  it("doesn't let another player claim", async () => {
    const id = `mine_${suffix()}`;
    await questServerService.seedCatalog({ quests: [individual(id)] });
    const who = await player();
    const other = await player();
    const done = await questServerService.complete({
      idempotencyKey: randomUUID(),
      player: who.uuid,
      quest: id,
      tier: 1,
    });
    await expect(
      questServerService.claimFromServer(done.completionId, {
        idempotencyKey: randomUUID(),
        player: other.uuid,
      }),
    ).rejects.toMatchObject({ data: { problem: 'notFound' } });
  });
});

describe('server quests', () => {
  it('pays by rank and refuses a second rank for the same person', async () => {
    const id = `nether_${suffix()}`;
    await questServerService.seedCatalog({ quests: [serverQuest(id)] });
    const players = [
      await player(5000),
      await player(5000),
      await player(5000),
      await player(5000),
    ];
    const amounts = [];
    for (const who of players) {
      const result = await questServerService.advancement({
        idempotencyKey: randomUUID(),
        player: who.uuid,
        quest: id,
      });
      amounts.push([result.rank, result.amount]);
    }
    expect(amounts).toEqual([
      [1, 1000],
      [2, 600],
      [3, 200],
      [4, 20],
    ]);
    await expect(
      questServerService.advancement({
        idempotencyKey: randomUUID(),
        player: players[0]!.uuid,
        quest: id,
      }),
    ).rejects.toMatchObject({ data: { problem: 'alreadyRanked' } });
    const view = await questServerService.playerView(players[1]!.uuid);
    expect(view.ranks[id]).toBe(2);
    expect(view.podiums[id]?.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });
});

describe('flash races', () => {
  it('pays the winner and stores an expired race', async () => {
    const id = `fish_${suffix()}`;
    await questServerService.seedCatalog({ quests: [flashQuest(id)] });
    const who = await player(5000);
    const now = new Date();
    const won = await questServerService.flash({
      idempotencyKey: randomUUID(),
      quest: id,
      quantity: 8,
      startedAt: new Date(now.getTime() - 300_000).toISOString(),
      endedAt: now.toISOString(),
      winner: who.uuid,
    });
    expect(won.amount).toBe(32);
    expect(await balanceOf(who.id)).toBe(5032);
    const expired = await questServerService.flash({
      idempotencyKey: randomUUID(),
      quest: id,
      quantity: 8,
      startedAt: now.toISOString(),
      endedAt: now.toISOString(),
      winner: null,
    });
    expect(expired).toMatchObject({ amount: 0, transactionId: null });
  });
});

describe('community quests', () => {
  it('counts contributions once and pays qualified contributors per tier', async () => {
    await db
      .update(questCommunity)
      .set({ status: 'cancelled' })
      .where(sql`${questCommunity.status} in ('running', 'scheduled')`);
    const big = await player(5000);
    const small = await player(5000);
    const now = Date.now();
    const created = await communityService.create(big.id, {
      definition: {
        title: { fr: 'Le grand chantier', en: 'The big dig' },
        objective: { type: 'mine' },
        goal: 1000,
        tiers: [
          { name: 'bronze', at: 50, reward: 100 },
          { name: 'silver', at: 100, reward: 200 },
          { name: 'gold', at: 150, reward: 400 },
        ],
        thresholdPercent: 10,
        topBonusPercent: 50,
      },
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    });
    expect(created.status).toBe('running');

    const key = randomUUID();
    const body = {
      idempotencyKey: key,
      items: [
        { player: big.uuid, amount: 1100 },
        { player: small.uuid, amount: 50 },
      ],
    };
    expect((await questServerService.contribute(created.id, body)).progress).toBe(1150);
    expect((await questServerService.contribute(created.id, body)).replayed).toBe(true);

    await db
      .update(questCommunity)
      .set({ endsAt: new Date(now - 1000) })
      .where(eq(questCommunity.id, created.id));
    await communityService.tick();
    // Bronze and silver reached: 300, with the top bonus 450 for the biggest contributor.
    expect(await balanceOf(big.id)).toBe(5450);
    // 50 is under the 10 % threshold (100): nothing.
    expect(await balanceOf(small.id)).toBe(5000);
    await expect(
      questServerService.contribute(created.id, {
        idempotencyKey: randomUUID(),
        items: [{ player: big.uuid, amount: 1 }],
      }),
    ).rejects.toMatchObject({ data: { problem: 'communityClosed' } });
  });
});

describe('index, cap and seasons', () => {
  it('uses the reference index with too few players', async () => {
    const result = await questAdminService.runIndex();
    expect(result.index).toBeGreaterThan(0);
    const [row] = await db.select().from(questIndexDay);
    expect(row?.day).toBe(result.day);
  });

  it('cuts a reward to the family budget', async () => {
    const id = `fish_${suffix()}`;
    await questServerService.seedCatalog({ quests: [flashQuest(id)] });
    // A budget of one LNBit for flash races: whatever already went out uses it up.
    await questAdminService.updateSettings((await player()).id, {
      cap: { percent: 0.000_000_1, shares: { individual: 0, server: 0, community: 0, flash: 100 } },
    });
    const who = await player(5000);
    const now = new Date().toISOString();
    const result = await questServerService.flash({
      idempotencyKey: randomUUID(),
      quest: id,
      quantity: 100,
      startedAt: now,
      endedAt: now,
      winner: who.uuid,
    });
    expect(result.capped).toBe(true);
    expect(result.amount).toBeLessThan(400);
  });

  it('keeps a secret quest as "???" until someone takes first place', async () => {
    const id = `secret_${suffix()}`;
    await questServerService.seedCatalog({ quests: [{ ...serverQuest(id), hidden: true }] });
    const masked = (await questPublicService.overview({})).quests.find((quest) => quest.id === id);
    expect(masked).toMatchObject({ name: { fr: '???', en: '???' }, hidden: true });
    expect(masked?.family === 'server' && masked.advancement).toBe('minecraft:hidden');

    const who = await player();
    await questServerService.advancement({
      idempotencyKey: randomUUID(),
      player: who.uuid,
      quest: id,
    });
    const shown = (await questPublicService.overview({})).quests.find((quest) => quest.id === id);
    expect(shown).toMatchObject({ name: { fr: 'Plus profond' } });
    expect(shown?.family === 'server' && shown.advancement).toBe(
      'minecraft:story/enter_the_nether',
    );
  });

  it('opens a new season only with the confirmation', async () => {
    const admin = await player();
    const before = await currentSeason();
    await expect(
      questAdminService.newSeason(admin.id, { confirmation: 'nope' }),
    ).rejects.toMatchObject({
      data: { problem: 'confirmationMismatch' },
    });
    await questAdminService.newSeason(admin.id, { confirmation: 'new season' });
    expect((await currentSeason()).number).toBe(before.number + 1);
    const page = await questPublicService.overview({ userId: admin.id });
    expect(page.season.number).toBe(before.number + 1);
    expect(page.me?.done).toBe(0);
  });
});

function dailyQuest(id: string, quantity: number) {
  return {
    id,
    family: 'daily',
    name: { fr: 'Bûcheron du jour', en: "Today's lumberjack" },
    icon: 'minecraft:oak_log',
    objective: { type: 'mine', target: '#minecraft:logs' },
    range: { min: quantity, max: quantity },
    rewardPerUnit: 5,
  };
}

describe('categories', () => {
  it('starts with the chapters and Records groups the game hard-coded', async () => {
    const config = await questServerService.config();
    const ids = config.categories.map((category) => `${category.family}:${category.id}`);
    expect(ids).toEqual(
      expect.arrayContaining(['individual:mining', 'individual:delivery', 'server:nether']),
    );
    expect(ids.indexOf('individual:mining')).toBeLessThan(ids.indexOf('individual:combat'));
  });

  it("adds quests.json's categories and checks the quests' names against them", async () => {
    const category = `early_${suffix()}`;
    const id = `early_${suffix()}`;
    const result = await questServerService.seedCatalog({
      categories: [
        {
          id: category,
          family: 'individual',
          name: { fr: 'Début de partie', en: 'Early game' },
          icon: 'minecraft:wooden_pickaxe',
          subcategories: [{ id: 'tools', name: { fr: 'Outils', en: 'Tools' } }],
        },
      ],
      quests: [{ ...individual(id), category, subcategory: 'tools' }],
    });
    expect(result).toMatchObject({ added: [id], categoriesAdded: [`individual:${category}`] });
    const config = await questServerService.config();
    expect(config.categories.find((entry) => entry.id === category)).toMatchObject({
      name: { en: 'Early game' },
      subcategories: [{ id: 'tools' }],
    });

    await expect(
      questServerService.seedCatalog({
        quests: [{ ...individual(`x_${suffix()}`), category: 'nowhere' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400, data: { problem: 'unknownCategory' } });
    await expect(
      questServerService.seedCatalog({
        quests: [{ ...individual(`x_${suffix()}`), category, subcategory: 'weapons' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    // A server quest without a category is fine: the game places it from its advancement.
    const free = `deeper_${suffix()}`;
    expect((await questServerService.seedCatalog({ quests: [serverQuest(free)] })).added).toEqual([
      free,
    ]);
  });

  it('refuses to delete a category or drop a subcategory that quests use', async () => {
    const admin = await player();
    const category = `cat_${suffix()}`;
    await questAdminService.createCategory(admin.id, {
      id: category,
      family: 'server',
      name: { fr: 'Aventure', en: 'Adventure' },
      icon: 'minecraft:map',
      subcategories: [{ id: 'far', name: { fr: 'Loin', en: 'Far' } }],
    });
    await expect(
      questAdminService.createCategory(admin.id, {
        id: category,
        family: 'server',
        name: { fr: 'Encore', en: 'Again' },
        icon: 'minecraft:map',
      }),
    ).rejects.toMatchObject({ data: { problem: 'idTaken' } });
    const id = `adventure_${suffix()}`;
    await questAdminService.createQuest(admin.id, {
      ...serverQuest(id),
      category,
      subcategory: 'far',
    });
    await expect(
      questAdminService.deleteCategory(admin.id, 'server', category),
    ).rejects.toMatchObject({ data: { problem: 'categoryInUse' } });
    await expect(
      questAdminService.updateCategory(admin.id, 'server', category, {
        name: { fr: 'Aventure', en: 'Adventure' },
        icon: 'minecraft:map',
        subcategories: [],
      }),
    ).rejects.toMatchObject({ data: { problem: 'categoryInUse' } });

    await questAdminService.updateQuest(admin.id, id, {
      definition: { ...serverQuest(id), category: 'nether' },
    });
    await questAdminService.deleteCategory(admin.id, 'server', category);
    expect((await questAdminService.categories()).some((entry) => entry.id === category)).toBe(
      false,
    );
  });

  it('imports and exports categories with the quests', async () => {
    const admin = await player();
    const category = `imp_${suffix()}`;
    const id = `imp_${suffix()}`;
    const result = await questAdminService.importCatalog(admin.id, {
      categories: [
        {
          id: category,
          family: 'individual',
          name: { fr: 'Importée', en: 'Imported' },
          icon: 'minecraft:chest',
        },
      ],
      quests: [{ ...individual(id), category }],
    });
    expect(result).toMatchObject({ added: [id], categoriesAdded: [`individual:${category}`] });
    const exported = await questAdminService.exportCatalog();
    expect(exported.categories.some((entry) => entry.id === category)).toBe(true);
    expect(exported.quests.find((entry) => entry.id === id)).toMatchObject({ category });
  });
});

describe('daily quests', () => {
  /** Only these daily quests can be drawn, `count` a day, and today isn't drawn yet. */
  async function onlyThese(ids: string[], count: number) {
    await db
      .update(quest)
      .set({ enabled: false })
      .where(and(eq(quest.family, 'daily'), notInArray(quest.id, ids)));
    await db.delete(questDailyDraw).where(eq(questDailyDraw.day, parisDay()));
    await questAdminService.updateSettings((await player()).id, { daily: { count } });
  }

  it('draws the same quests for everyone and pays each player once', async () => {
    const a = `daily_${suffix()}`;
    const b = `daily_${suffix()}`;
    await questServerService.seedCatalog({ quests: [dailyQuest(a, 4), dailyQuest(b, 6)] });
    await onlyThese([a, b], 2);

    const config = await questServerService.config();
    expect(config.daily.day).toBe(parisDay());
    expect(config.daily.quests).toHaveLength(2);
    expect(config.daily.quests).toEqual(
      expect.arrayContaining([
        { quest: a, quantity: 4 },
        { quest: b, quantity: 6 },
      ]),
    );
    // Asked again, the day keeps its draw.
    expect((await questDailyService.today()).quests).toEqual(config.daily.quests);
    expect(new Date(config.daily.endsAt).getTime()).toBeGreaterThan(Date.now());

    const who = await player(5000);
    const key = randomUUID();
    const paid = await questDailyService.complete({
      idempotencyKey: key,
      player: who.uuid,
      day: parisDay(),
      quest: a,
    });
    expect(paid).toMatchObject({ replayed: false, quantity: 4, amount: 20, capped: false });
    expect(await balanceOf(who.id)).toBe(5020);
    const again = await questDailyService.complete({
      idempotencyKey: key,
      player: who.uuid,
      day: parisDay(),
      quest: a,
    });
    expect(again).toMatchObject({ replayed: true, amount: 20 });
    await expect(
      questDailyService.complete({
        idempotencyKey: randomUUID(),
        player: who.uuid,
        day: parisDay(),
        quest: a,
      }),
    ).rejects.toMatchObject({ data: { problem: 'alreadyCompleted' } });
    expect(await balanceOf(who.id)).toBe(5020);

    const view = await questServerService.playerView(who.uuid);
    expect(view.daily).toEqual([a]);
    const page = await questPublicService.overview({ userId: who.id });
    expect(page.me?.daily).toEqual([a]);
    expect(page.daily?.quests.find((entry) => entry.quest === a)?.done).toBe(1);
    expect(page.leaderboard.some((row) => row.username === who.username)).toBe(true);
  });

  it("refuses a quest that wasn't drawn, or a day that is over", async () => {
    const a = `daily_${suffix()}`;
    const other = `daily_${suffix()}`;
    await questServerService.seedCatalog({ quests: [dailyQuest(a, 3), dailyQuest(other, 3)] });
    await onlyThese([a], 1);
    await questDailyService.today();
    const who = await player();
    await expect(
      questDailyService.complete({
        idempotencyKey: randomUUID(),
        player: who.uuid,
        day: parisDay(),
        quest: other,
      }),
    ).rejects.toMatchObject({ data: { problem: 'notDrawn' } });
    await expect(
      questDailyService.complete({
        idempotencyKey: randomUUID(),
        player: who.uuid,
        day: previousDay(previousDay(parisDay())),
        quest: a,
      }),
    ).rejects.toMatchObject({ data: { problem: 'expired' } });
  });

  it('draws nothing when the count is 0', async () => {
    const a = `daily_${suffix()}`;
    await questServerService.seedCatalog({ quests: [dailyQuest(a, 3)] });
    await onlyThese([a], 0);
    expect((await questDailyService.today()).quests).toEqual([]);
  });
});
