import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { user, wardenBan } from '~~/server/db/schema';
import { adminWeekService } from '~~/server/services/admin-week';

// The quests helpers reach Nitro's cache and the services refuse with Nuxt's createError.
vi.mock('nuxt/server', () => ({
  createError: (input: { status: number; statusText: string }) =>
    Object.assign(new Error(input.statusText), input),
}));
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
  useStorage: () => ({}),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const tag = `Wk${String(Date.now())}`;
const ids = (week: Awaited<ReturnType<typeof adminWeekService.week>>) =>
  week.stats.map((stat) => stat.id);
const value = (week: Awaited<ReturnType<typeof adminWeekService.week>>, id: string) =>
  week.stats.find((stat) => stat.id === id)?.value ?? 0;

describe('admin week', () => {
  it('gives each role its own figures', async () => {
    expect(ids(await adminWeekService.week('admin'))).toEqual([
      'signups',
      'eventsUpcoming',
      'bans',
      'registrations',
    ]);
    expect(ids(await adminWeekService.week('warden-admin'))).toEqual(['bans', 'appealsAnswered']);
    expect(ids(await adminWeekService.week('events-manager'))).toEqual([
      'registrations',
      'eventsUpcoming',
    ]);
    expect(ids(await adminWeekService.week('economy-admin'))).toEqual([
      'circulation',
      'questsCompleted',
      'rewardIndex',
    ]);
    expect(ids(await adminWeekService.week(null))).toEqual([]);
  });

  describe('counts', () => {
    let before: Awaited<ReturnType<typeof adminWeekService.week>>;
    beforeAll(async () => {
      before = await adminWeekService.week('admin');
      await db.insert(user).values([
        { id: `${tag}-a`, name: `${tag} A`, email: `${tag}-a@epitech.eu`, tenantId: EPITECH },
        // A ghost has not signed in, so it is not a sign-up.
        {
          id: `${tag}-g`,
          name: `${tag} G`,
          email: `${tag}-g@epitech.eu`,
          tenantId: EPITECH,
          ghost: true,
        },
      ]);
      await db.insert(wardenBan).values([
        { userId: `${tag}-a`, reason: 'Spam', source: 'web' as const },
        {
          userId: `${tag}-a`,
          reason: 'Old',
          source: 'web' as const,
          createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
        },
      ]);
    });

    it('counts the last 7 days only, and skips ghosts', async () => {
      const after = await adminWeekService.week('admin');
      expect(value(after, 'signups') - value(before, 'signups')).toBe(1);
      expect(value(after, 'bans') - value(before, 'bans')).toBe(1);
    });
  });
});
