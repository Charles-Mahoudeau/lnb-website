import { like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { user } from '~~/server/db/schema';
import { peopleService } from '~~/server/services/people';

// The People list's `feed-announcer` role choice and the `hasRole` quick filter's reach over the
// new role (docs/feed.md, "Granting the announcer role").

vi.mock('nuxt/server', () => ({
  createError: (input: { status: number; statusText: string; data?: unknown }) =>
    Object.assign(new Error(input.statusText), input),
}));
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
  useStorage: () => ({}),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const tag = `PplFeed${String(Date.now())}`;
const make = (name: string, role: string | null) => ({
  id: `${tag}-${name}`,
  name: `${tag} ${name}`,
  email: `${tag}-${name}@epitech.eu`,
  tenantId: EPITECH,
  role,
});
const people = {
  announcer: make('announcer', 'feed-announcer'),
  mixed: make('mixed', 'events-manager, feed-announcer'),
  moderator: make('moderator', 'warden-admin'),
  lookalike: make('lookalike', 'feed-announcer-extra'),
  plain: make('plain', null),
};

beforeAll(async () => {
  await db.insert(user).values(Object.values(people));
});
afterAll(async () => {
  await db.delete(user).where(like(user.id, `${tag}-%`));
});

const ids = async (query: Parameters<typeof peopleService.list>[1]) =>
  (await peopleService.list('admin', { q: tag, ...query })).items.map((row) => row.userId).sort();

describe('the feed-announcer role in the People list', () => {
  it('filters by the role choice: whole role names only, with other roles beside it', async () => {
    expect(await ids({ role: 'feed-announcer' })).toEqual(
      [people.announcer.id, people.mixed.id].sort(),
    );
    expect(await ids({ role: 'any' })).toHaveLength(5);
  });

  it('does not count a moderator as holding the role, as the role is not theirs to hold', async () => {
    expect(await ids({ role: 'feed-announcer' })).not.toContain(people.moderator.id);
  });

  it('counts announcers among the people with a role', async () => {
    expect(await ids({ filters: ['hasRole'] })).toEqual(
      [people.announcer.id, people.mixed.id, people.moderator.id].sort(),
    );
  });

  it('combines the role choice with the quick filters and the total', async () => {
    const page = await peopleService.list('admin', {
      q: tag,
      role: 'feed-announcer',
      filters: ['hasRole'],
    });
    expect(page.total).toBe(2);
    expect(page.items.map((row) => row.userId).sort()).toEqual(
      [people.announcer.id, people.mixed.id].sort(),
    );
  });

  it('keeps refusing the role choice to roles that are not site admins', async () => {
    await expect(
      peopleService.list('warden-admin', { role: 'feed-announcer' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      peopleService.list('events-manager', { role: 'feed-announcer' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
