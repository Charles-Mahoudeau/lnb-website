import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import AdminUsers from '~/components/admin/Users.vue';

import type { AdminUserPage, AdminUserRow } from '#shared/schemas/admin';

function row(overrides: Partial<AdminUserRow>): AdminUserRow {
  return {
    userId: 'u1',
    name: 'Alex Laurent',
    email: 'alex.laurent@epitech.eu',
    image: null,
    school: 'Epitech',
    admin: false,
    wardenAdmin: false,
    eventsManager: false,
    createdAt: '2024-09-01T12:00:00.000Z',
    lastSignInAt: '2026-10-14T12:00:00.000Z',
    inactive: false,
    ban: null,
    ...overrides,
  };
}

const page: AdminUserPage = {
  items: [
    row({ userId: 'u1', admin: true }),
    row({
      userId: 'u2',
      name: 'Sam Nguyen',
      school: 'ISEG',
      ban: { reason: 'Spam', expiresAt: null },
    }),
    row({ userId: 'u3', name: 'Léa Roux', inactive: true, lastSignInAt: null }),
  ],
  nextCursor: null,
  total: 3,
};
registerEndpoint('/api/admin/users', () => page);

describe('admin users list', () => {
  it('shows each account with its roles and status', async () => {
    const list = await mountSuspended(AdminUsers);
    const text = list.text();
    expect(text).toContain('Alex Laurent');
    expect(text).toContain('alex.laurent@epitech.eu');
    expect(text).toContain('Admin');
    expect(text).toContain('Banned from the site');
    expect(text).toContain('Inactive for 24 months');
    expect(text).toContain('Never');
  });

  it('shows the bulk bar once accounts are ticked, and hides it on clear', async () => {
    const list = await mountSuspended(AdminUsers);
    expect(list.find('[role="toolbar"]').exists()).toBe(false);
    const boxes = list.findAll('button[role="checkbox"]');
    // The header checkbox, then one per account.
    expect(boxes).toHaveLength(4);

    await boxes[1]!.trigger('click');
    expect(list.find('[role="toolbar"]').text()).toContain('1 selected');

    await boxes[0]!.trigger('click');
    expect(list.find('[role="toolbar"]').text()).toContain('3 selected');

    await list.get('[aria-label="Clear selection"]').trigger('click');
    expect(list.find('[role="toolbar"]').exists()).toBe(false);
  });
});
