import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  adminEntries,
  adminTabs,
  ADMIN_ENTRIES,
  personTabs,
  SETTINGS_SECTIONS,
  settingsSections,
} from '../../app/utils/admin-nav.ts';
import { ADMIN_REDIRECTS } from '../../shared/admin-redirects.ts';

const ids = (list: { id: string }[]) => list.map((entry) => entry.id);

describe('admin sidebar entries', () => {
  it('shows a site admin everything', () => {
    expect(ids(adminEntries('admin'))).toEqual(ids(ADMIN_ENTRIES));
  });

  it('shows a Warden admin the Minecraft group except Economy and Quests', () => {
    expect(ids(adminEntries('warden-admin'))).toEqual([
      'home',
      'people',
      'moderation',
      'playtime',
      'anticheat',
      'modpack',
    ]);
  });

  it('shows an events manager the Events group and Short links', () => {
    expect(ids(adminEntries('events-manager'))).toEqual([
      'home',
      'people',
      'shortLinks',
      'events',
      'posters',
      'notifications',
      'partnerEvents',
    ]);
  });

  it('shows an economy admin Economy and Quests', () => {
    expect(ids(adminEntries('economy-admin'))).toEqual(['home', 'people', 'economy', 'quests']);
  });

  it('gives a person with several roles the union, in sidebar order', () => {
    expect(ids(adminEntries('economy-admin,events-manager'))).toEqual([
      'home',
      'people',
      'shortLinks',
      'events',
      'posters',
      'notifications',
      'partnerEvents',
      'economy',
      'quests',
    ]);
  });

  it('shows nothing to people without an admin role', () => {
    expect(adminEntries(null)).toEqual([]);
    expect(adminEntries('user')).toEqual([]);
  });

  it('puts the Events and Minecraft entries in their groups', () => {
    const groups = Object.groupBy(ADMIN_ENTRIES, (entry) => entry.group ?? 'top');
    expect(ids(groups.top ?? [])).toEqual(['home', 'people', 'shortLinks', 'site']);
    expect(ids(groups.events ?? [])).toEqual([
      'events',
      'posters',
      'notifications',
      'partnerEvents',
    ]);
    expect(ids(groups.minecraft ?? [])).toEqual([
      'moderation',
      'playtime',
      'anticheat',
      'modpack',
      'economy',
      'quests',
    ]);
  });

  it('hides the vote tab of Modpack when the modList flag is off', () => {
    expect(ids(adminTabs('modpack', () => true))).toContain('vote');
    expect(ids(adminTabs('modpack', () => false))).toEqual(['modlist', 'files', 'downloads']);
  });
});

describe('Moderation tabs', () => {
  it('has Appeals, Bans and Rules', () => {
    expect(ids(adminTabs('moderation', () => true))).toEqual(['appeals', 'bans', 'rules']);
  });
});

describe('Person tabs', () => {
  it('gives site admins every tab', () => {
    expect(ids(personTabs('admin', false))).toEqual([
      'summary',
      'minecraft',
      'moderation',
      'playtime',
      'anticheat',
      'lnbits',
      'events',
      'account',
    ]);
  });

  it('gives each role its own tabs', () => {
    expect(ids(personTabs('warden-admin', false))).toEqual([
      'summary',
      'minecraft',
      'moderation',
      'playtime',
      'anticheat',
    ]);
    expect(ids(personTabs('events-manager', false))).toEqual(['summary', 'events']);
    expect(ids(personTabs('economy-admin', false))).toEqual(['summary', 'lnbits']);
    expect(ids(personTabs('economy-admin,events-manager', false))).toEqual([
      'summary',
      'lnbits',
      'events',
    ]);
  });

  it('gives a ghost only Summary, Events and Site account', () => {
    expect(ids(personTabs('admin', true))).toEqual(['summary', 'events', 'account']);
    expect(ids(personTabs('warden-admin', true))).toEqual(['summary']);
  });
});

describe('admin Settings sections', () => {
  it('shows a site admin every section', () => {
    expect(ids(settingsSections('admin'))).toEqual(ids(SETTINGS_SECTIONS));
  });

  it('shows a Warden admin Activity and the Minecraft sections of the Warden', () => {
    expect(ids(settingsSections('warden-admin'))).toEqual([
      'activity',
      'warden',
      'anticheat',
      'modpack',
      'playtime',
    ]);
  });

  it('shows an events manager Rooms, Types and Notifications', () => {
    expect(ids(settingsSections('events-manager'))).toEqual(['rooms', 'types', 'notifications']);
  });

  it('shows an economy admin Economy and Quests', () => {
    expect(ids(settingsSections('economy-admin'))).toEqual(['economy', 'quests']);
  });

  it('gives a person with several roles the union', () => {
    expect(ids(settingsSections('events-manager,economy-admin'))).toEqual([
      'rooms',
      'types',
      'notifications',
      'economy',
      'quests',
    ]);
  });
});

describe('admin redirects', () => {
  const pagesDir = fileURLToPath(new URL('../../app/pages', import.meta.url));

  /** Whether a page file serves the path, with `[param]` files matching any segment. */
  function hasPage(path: string): boolean {
    const parts = (path.split('?')[0] ?? '').split('/').filter(Boolean);
    const walk = (dir: string, rest: string[]): boolean => {
      if (!rest.length) return existsSync(`${dir}.vue`) || existsSync(`${dir}/index.vue`);
      const [head, ...tail] = rest;
      if (head === undefined) return false;
      if (walk(`${dir}/${head}`, tail)) return true;
      // A dynamic folder or file, such as [id]/[tab].vue.
      const dynamic = [...new Set(['[id]', '[tab]', '[section]', '[userId]'])];
      return dynamic.some((name) => walk(`${dir}/${name}`, tail));
    };
    return walk(pagesDir, parts);
  }

  it('sends every old address to a page that exists', () => {
    for (const [from, to] of Object.entries(ADMIN_REDIRECTS)) {
      expect(hasPage(to), `${from} -> ${to}`).toBe(true);
    }
  });

  it('keeps no page at an old address that is redirected', () => {
    for (const from of Object.keys(ADMIN_REDIRECTS)) {
      const file = `${pagesDir}${from}`;
      expect(existsSync(`${file}.vue`) || existsSync(`${file}/index.vue`), from).toBe(false);
    }
  });

  it('does not redirect to itself or chain through another redirect', () => {
    for (const [from, to] of Object.entries(ADMIN_REDIRECTS)) {
      expect(to).not.toBe(from);
      expect(ADMIN_REDIRECTS[to], `${from} chains`).toBeUndefined();
    }
  });

  it('has a page for the two redirects that carry an ID', () => {
    expect(existsSync(`${pagesDir}/admin/warden/players/[userId].vue`)).toBe(true);
    expect(existsSync(`${pagesDir}/admin/events/[id]/index.vue`)).toBe(true);
  });

  it('covers every row of the plan', () => {
    expect(Object.keys(ADMIN_REDIRECTS)).toHaveLength(30);
    expect(ADMIN_REDIRECTS['/admin/mods/suggestions']).toBe('/admin/modpack/vote/suggestions');
    expect(ADMIN_REDIRECTS['/admin/mods/vote/suggestions']).toBe('/admin/modpack/vote/suggestions');
  });
});
