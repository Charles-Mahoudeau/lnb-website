import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';

import AdminHome from '~/components/admin/Home.vue';

import type { AdminInbox } from '#shared/schemas/admin';

let inbox: AdminInbox = { items: [], badges: {} };
registerEndpoint('/api/admin/inbox', () => inbox);

function signIn(role: string) {
  useState('auth-session').value = { user: { id: 'u1', name: 'Test', role, tenantId: 'x' } };
  useState('auth-session-loaded').value = true;
}

async function mountHome(role: string, next: AdminInbox) {
  inbox = next;
  signIn(role);
  clearNuxtData('admin-inbox');
  return mountSuspended(AdminHome);
}

describe('Home', () => {
  it('lists a row per queue with its count, its oldest and a button to open it', async () => {
    const home = await mountHome('warden-admin', {
      items: [
        {
          id: 'appeals',
          count: 3,
          to: '/admin/moderation/appeals',
          at: '2026-11-02T10:00:00Z',
          name: null,
        },
        {
          id: 'anticheat',
          count: 3,
          to: '/admin/anticheat/review',
          at: null,
          name: null,
          review: 1,
          alerts: 2,
        },
        {
          id: 'transfers',
          count: 1,
          to: '/admin/people?filters=transfer',
          at: '2026-11-10T10:00:00Z',
          name: null,
        },
      ],
      badges: {},
    });
    await vi.waitFor(() => {
      expect(home.text()).toContain('3 ban appeals waiting');
    });
    expect(home.text()).toContain('The oldest was sent on November 2, 2026');
    expect(home.text()).toContain('1 file to review');
    expect(home.text()).toContain('2 open anticheat alerts');
    expect(home.text()).toContain('1 account takeover to review');
    const hrefs = home.findAll('li a').map((link) => link.attributes('href'));
    expect(hrefs).toEqual([
      '/admin/moderation/appeals',
      '/admin/anticheat/review',
      '/admin/people?filters=transfer',
    ]);
    expect(home.text()).not.toContain('Nothing waiting');
  });

  it('says nothing is waiting and links to People when the inbox is empty', async () => {
    const home = await mountHome('events-manager', { items: [], badges: {} });
    await vi.waitFor(() => {
      expect(home.text()).toContain('Nothing waiting');
    });
    expect(home.findAll('a').map((link) => link.attributes('href'))).toContain('/admin/people');
    expect(home.find('ul').exists()).toBe(false);
  });

  it('describes rate limiting and an events waitlist, and links the activity log to Warden admins', async () => {
    const home = await mountHome('admin', {
      items: [
        {
          id: 'rateLimit',
          count: 1,
          to: '/admin/settings/rate-limit',
          at: null,
          name: null,
          mode: 'off',
        },
        {
          id: 'eventWaitlists',
          count: 2,
          to: '/admin/events',
          at: '2026-12-05T18:00:00Z',
          name: 'Friday LAN',
          waiting: 7,
        },
      ],
      badges: {},
    });
    await vi.waitFor(() => {
      expect(home.text()).toContain('Rate limiting is off');
    });
    expect(home.text()).toContain('2 upcoming events have a waitlist');
    expect(home.text()).toContain('First up is Friday LAN');
    expect(home.text()).toContain('7 waiting');
    expect(home.findAll('a').map((link) => link.attributes('href'))).toContain(
      '/admin/settings/activity',
    );
  });

  it('keeps the activity link from roles that cannot open the log', async () => {
    const home = await mountHome('events-manager', { items: [], badges: {} });
    await vi.waitFor(() => {
      expect(home.text()).toContain('Nothing waiting');
    });
    expect(home.text()).not.toContain('See all activity');
  });
});
