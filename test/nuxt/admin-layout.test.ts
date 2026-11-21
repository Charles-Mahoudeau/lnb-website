import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminLayout from '~/layouts/admin.vue';
import SettingsPage from '~/pages/admin/settings/[section].vue';

// The inbox the sidebar badges read: the Warden's queues and the events' waitlists.
registerEndpoint('/api/admin/inbox', () => ({
  items: [],
  badges: { anticheat: 5, moderation: 2, modpack: 1, events: 4 },
}));

function signIn(role: string | null) {
  useState('auth-session').value = { user: { id: 'u1', name: 'Test', role, tenantId: 'x' } };
  useState('auth-session-loaded').value = true;
}

/** The labels of the sidebar's links, in order. */
async function sidebar(role: string) {
  signIn(role);
  const layout = await mountSuspended(AdminLayout, { route: '/admin' });
  return layout.findAll('a').map((link) => link.text().replace(/\d+$/, '').trim());
}

describe('admin sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lists a site admin every entry, with Settings and the way back in the footer', async () => {
    const links = await sidebar('admin');
    expect(links).toEqual(
      expect.arrayContaining([
        'Home',
        'People',
        'Short links',
        'Site',
        'Events',
        'Posters',
        'Notifications',
        'Partner events',
        'Moderation',
        'Playtime',
        'Anticheat',
        'Modpack',
        'Changelog',
        'Economy',
        'Quests',
        'Settings',
        'Back to the site',
      ]),
    );
    expect(links.indexOf('Settings')).toBeGreaterThan(links.indexOf('Quests'));
    expect(links.indexOf('Back to the site')).toBeGreaterThan(links.indexOf('Settings'));
  });

  it('keeps a Warden admin to the Minecraft entries of the Warden', async () => {
    const links = await sidebar('warden-admin');
    expect(links).toEqual(
      expect.arrayContaining(['Moderation', 'Anticheat', 'Modpack', 'Changelog']),
    );
    expect(links).not.toContain('Short links');
    expect(links).not.toContain('Economy');
    expect(links).not.toContain('Posters');
    expect(links).not.toContain('Site');
  });

  it('keeps an events manager to the Events group and Short links', async () => {
    const links = await sidebar('events-manager');
    expect(links).toEqual(expect.arrayContaining(['Short links', 'Posters', 'Notifications']));
    expect(links).not.toContain('Moderation');
    expect(links).not.toContain('Changelog');
    expect(links).not.toContain('Quests');
  });

  it('keeps an economy admin to Economy and Quests', async () => {
    const links = await sidebar('economy-admin');
    expect(links).toEqual(expect.arrayContaining(['Economy', 'Quests']));
    expect(links).not.toContain('Changelog');
    expect(links).not.toContain('Short links');
    expect(links).not.toContain('Moderation');
  });

  it('shows the counts of the inbox as neutral badges, and the total on a folded group', async () => {
    signIn('admin');
    const layout = await mountSuspended(AdminLayout, { route: '/admin' });
    await vi.waitFor(() => {
      expect(layout.text()).toContain('Anticheat5');
    });
    expect(layout.text()).toContain('Moderation2');
    // Both groups are open: no total on their headers yet.
    const header = layout.findAll('button').find((button) => button.text().startsWith('Minecraft'));
    expect(header?.text()).toBe('Minecraft');
    await header?.trigger('click');
    await nextTick();
    // Folded, Minecraft shows 5 + 2 + 1.
    expect(header?.text()).toBe('Minecraft8');
    // The fold lives in shared state: open the group again for the next test.
    await header?.trigger('click');
  });

  it('folds a group and remembers it in this browser', async () => {
    signIn('admin');
    const layout = await mountSuspended(AdminLayout, { route: '/admin' });
    expect(layout.text()).toContain('Playtime');
    const header = layout.findAll('button').find((button) => button.text().startsWith('Minecraft'));
    expect(header).toBeDefined();
    await header?.trigger('click');
    await nextTick();
    expect(JSON.parse(localStorage.getItem('lnb_admin_folds') ?? '{}')).toEqual({
      events: true,
      minecraft: false,
    });
  });
});

describe('admin settings', () => {
  async function sections(role: string) {
    signIn(role);
    const page = await mountSuspended(SettingsPage, { route: '/admin/settings/rooms' });
    return page
      .findAll('nav a')
      .map((link) => link.text())
      .filter(Boolean);
  }

  it('lists the sections a role may open, grouped by area', async () => {
    expect(await sections('events-manager')).toEqual([
      'Activity',
      'Rooms',
      'Event types',
      'Notifications',
    ]);
    expect(await sections('economy-admin')).toEqual(['Activity', 'Economy', 'Quests']);
    expect(await sections('warden-admin')).toEqual([
      'Activity',
      'Warden',
      'Anticheat',
      'Modpack',
      'Playtime',
    ]);
  });

  it('filters the sections with "Find a setting"', async () => {
    signIn('admin');
    const page = await mountSuspended(SettingsPage, { route: '/admin/settings/flags' });
    await page.find('input').setValue('map');
    expect(page.findAll('nav a').map((link) => link.text())).toEqual(['Map']);
    await page.find('input').setValue('zzz');
    expect(page.text()).toContain('No setting matches.');
  });
});
