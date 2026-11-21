import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AdminPeople from '~/components/admin/People.vue';

import type { AdminPeoplePage, AdminPersonRow } from '#shared/schemas/admin';

function row(overrides: Partial<AdminPersonRow>): AdminPersonRow {
  return {
    userId: 'u1',
    name: 'Alex Laurent',
    image: null,
    school: 'Epitech',
    ghost: false,
    email: 'alex.laurent@epitech.eu',
    roles: { admin: true, wardenAdmin: false, eventsManager: false, economyAdmin: false },
    lastSignInAt: '2026-10-14T12:00:00.000Z',
    inactive: false,
    siteBan: null,
    ban: null,
    minecraft: {
      accounts: [{ uuid: 'a', username: 'AlexCraft', online: false }],
      lastSeenAt: null,
      playtimeSeconds: 0,
      transferWarning: null,
    },
    anticheat: null,
    overLimit: false,
    balance: 12_000,
    registrations: { upcoming: 1, total: 3 },
    ...overrides,
  };
}

const page: AdminPeoplePage = {
  items: [
    row({ userId: 'u1' }),
    row({
      userId: 'u2',
      name: 'Sam Nguyen',
      school: 'ISEG',
      roles: { admin: false, wardenAdmin: false, eventsManager: false, economyAdmin: false },
      ban: { id: 'b', reason: 'Spam', expiresAt: null },
      anticheat: { score: 5, band: 'held', manualHold: false, flagged: true },
      overLimit: true,
    }),
    row({ userId: 'u3', name: 'Léa Roux', inactive: true, lastSignInAt: null, balance: null }),
    row({ userId: 'u4', name: 'Noa Petit', ghost: true, lastSignInAt: null }),
  ],
  nextCursor: null,
  total: 4,
  match: null,
};
const queries: Record<string, unknown>[] = [];
registerEndpoint('/api/admin/people', (event) => {
  queries.push(Object.fromEntries(new URL(event.path, 'http://localhost').searchParams));
  return page;
});

function signIn(role: string) {
  useState('auth-session').value = { user: { id: 'me', name: 'Me', role, tenantId: 'x' } };
  useState('auth-session-loaded').value = true;
}

// Every mount shares the list's `useFetch` key, so each one is unmounted before the next test.
const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

async function mountAs(role: string) {
  signIn(role);
  const wrapper = await mountSuspended(AdminPeople);
  mounted.push(wrapper);
  return wrapper;
}

describe('the People list', () => {
  beforeEach(() => {
    queries.length = 0;
  });

  it('gives site admins every column, the bulk checkboxes and every quick filter', async () => {
    const list = await mountAs('admin');
    const text = list.text();
    expect(text).toContain('alex.laurent@epitech.eu');
    expect(text).toContain('Last sign-in');
    expect(text).toContain('Not signed in yet');
    expect(text).toContain('Inactive for 24 months');
    expect(text).toContain('Create ghost');
    expect(list.findAll('button[role="checkbox"]')).toHaveLength(5);
    expect(list.find('select, [role="combobox"]').exists()).toBe(true);
  });

  it('shows the bulk bar once accounts are ticked, and hides it on clear', async () => {
    const list = await mountAs('admin');
    expect(list.find('[role="toolbar"]').exists()).toBe(false);
    const boxes = list.findAll('button[role="checkbox"]');
    await boxes[1]!.trigger('click');
    expect(list.find('[role="toolbar"]').text()).toContain('1 selected');
    await boxes[0]!.trigger('click');
    expect(list.find('[role="toolbar"]').text()).toContain('4 selected');
    await list.get('[aria-label="Clear selection"]').trigger('click');
    expect(list.find('[role="toolbar"]').exists()).toBe(false);
  });

  it('gives Warden admins Minecraft data and the Warden filters, with no bulk actions', async () => {
    const list = await mountAs('warden-admin');
    const text = list.text();
    expect(text).toContain('AlexCraft');
    expect(text).toContain('Flagged by the anticheat');
    expect(text).toContain('Over the playtime limit');
    expect(text).toContain('Flagged');
    expect(text).toContain('Over the limit');
    // The `inactive` filter and the sign-in column belong to site admins.
    expect(list.findAll('button').map((button) => button.text())).not.toContain(
      'Inactive for 24 months',
    );
    expect(text).not.toContain('Last sign-in');
    expect(list.findAll('button[role="checkbox"]')).toHaveLength(0);
    expect(list.find('input[type="search"]').attributes('placeholder')).toBe(
      'Search by name, email, Minecraft name or UUID',
    );
  });

  it('gives economy admins balances and no emails', async () => {
    const list = await mountAs('economy-admin');
    const text = list.text();
    expect(text).toContain('120 LNBits');
    expect(text).toContain('No bank account');
    expect(text).not.toContain('alex.laurent@epitech.eu');
    expect(text).not.toContain('Flagged by the anticheat');
    expect(list.find('input[type="search"]').attributes('placeholder')).toBe(
      'Search by name or Minecraft name',
    );
  });

  it('gives events managers registrations, emails, and only the ghost filter', async () => {
    const list = await mountAs('events-manager');
    const text = list.text();
    expect(text).toContain('1 upcoming, 3 in all');
    expect(text).toContain('Not signed in yet');
    expect(text).not.toContain('Flagged by the anticheat');
    expect(text).not.toContain('AlexCraft');
    expect(text).toContain('Create ghost');
  });

  it('sends the quick filters to the server', async () => {
    const list = await mountAs('warden-admin');
    const chip = list.findAll('button').find((button) => button.text() === 'Banned');
    expect(chip).toBeDefined();
    await chip!.trigger('click');
    await vi.waitFor(() => {
      expect(queries.some((query) => query.filters === 'banned')).toBe(true);
    });
  });
});
