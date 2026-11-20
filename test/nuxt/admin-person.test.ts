import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import PersonPage from '~/pages/admin/people/[userId]/[tab].vue';

import type { AdminPersonSummary } from '#shared/schemas/admin';

const base: AdminPersonSummary = {
  userId: 'u1',
  name: 'Alex Laurent',
  image: null,
  school: 'Epitech',
  ghost: false,
  createdAt: '2025-09-01T12:00:00.000Z',
};

const summaries: Record<string, AdminPersonSummary> = {
  // Banned, with an appeal waiting, a file to look at and time past the limit.
  banned: {
    ...base,
    userId: 'banned',
    email: 'alex@epitech.eu',
    roles: { admin: false, wardenAdmin: false, eventsManager: false, economyAdmin: false },
    minecraft: {
      accounts: [{ uuid: 'a', username: 'AlexCraft', online: false, lastSeenAt: null }],
      limit: { used: 1, max: 3 },
      playtimeSeconds: 7200,
      devices: 1,
      pendingTransfers: 0,
    },
    moderation: {
      activeBan: { id: 'b1', reason: 'Griefing', expiresAt: null, createdAt: base.createdAt },
      appeal: { id: 'ap', status: 'pending' },
      bans: 1,
      notes: 0,
      warnings: 2,
    },
    playtime: { overSeconds: 900 },
    anticheat: {
      score: 10,
      band: 'held',
      manualHold: false,
      flagged: true,
      flaggedFiles: 1,
      flaggedFile: { sha512: 'x', filename: 'freecam.jar', status: 'refused' },
    },
  },
  clean: {
    ...base,
    userId: 'clean',
    email: 'alex@epitech.eu',
    moderation: { activeBan: null, appeal: null, bans: 0, notes: 0, warnings: 0 },
    playtime: { overSeconds: 0 },
    anticheat: null,
  },
  bank: { ...base, userId: 'bank', economy: { accountId: 'acc', balance: 420, frozen: false } },
  organizer: {
    ...base,
    userId: 'organizer',
    events: {
      registrations: [
        {
          eventId: 'e1',
          name: 'Rocket League night',
          startsAt: '2026-12-01T18:00:00.000Z',
          endsAt: '2026-12-01T23:00:00.000Z',
          status: 'registered',
          team: null,
        },
      ],
    },
  },
  ghost: {
    ...base,
    userId: 'ghost',
    ghost: true,
    email: 'ghost@epitech.eu',
    tenantId: 'x',
    roles: { admin: false, wardenAdmin: false, eventsManager: false, economyAdmin: false },
    siteBan: null,
    events: { registrations: [] },
  },
};
for (const [id, summary] of Object.entries(summaries)) {
  registerEndpoint(`/api/admin/people/${id}/summary`, () => summary);
}

function signIn(role: string) {
  useState('auth-session').value = { user: { id: 'me', name: 'Me', role, tenantId: 'x' } };
  useState('auth-session-loaded').value = true;
}

async function open(role: string, id: string, tab = 'summary') {
  signIn(role);
  return mountSuspended(PersonPage, { route: `/admin/people/${id}/${tab}` });
}

const buttons = (wrapper: Awaited<ReturnType<typeof open>>) =>
  wrapper.findAll('button').map((button) => button.text());
const tabLinks = (wrapper: Awaited<ReturnType<typeof open>>) =>
  wrapper.findAll('[role="tablist"] a, nav a').map((link) => link.text());

describe('the Person page header', () => {
  it('offers a Warden admin the moderation actions of a banned player, none solid', async () => {
    const page = await open('warden-admin', 'banned');
    const names = buttons(page);
    expect(names).toEqual(
      expect.arrayContaining(['Add a note', 'Warn', 'Change the end', 'Lift the ban']),
    );
    expect(names).not.toContain('Ban');
    // The destructive and moderation actions are outline buttons.
    const lift = page.findAll('button').find((button) => button.text() === 'Lift the ban');
    expect(lift?.classes().join(' ')).toContain('ring');
    const note = page.findAll('button').find((button) => button.text() === 'Add a note');
    expect(note?.classes().join(' ')).not.toContain('ring');
  });

  it('shows the callouts that need an answer', async () => {
    const page = await open('warden-admin', 'banned');
    const text = page.text();
    expect(text).toContain('Answer the appeal');
    expect(text).toContain('Review the file');
    expect(text).toContain('freecam.jar');
    expect(text).toContain('See the playtime');
  });

  it('offers Ban, not the ban actions, to a player in good standing', async () => {
    const page = await open('warden-admin', 'clean');
    const names = buttons(page);
    expect(names).toEqual(expect.arrayContaining(['Add a note', 'Warn', 'Ban']));
    expect(names).not.toContain('Lift the ban');
    expect(names).not.toContain('Change the end');
    expect(page.text()).not.toContain('Answer the appeal');
  });

  it('offers economy admins Adjust balance, and events managers Register', async () => {
    expect(buttons(await open('economy-admin', 'bank'))).toContain('Adjust balance');
    const organizer = await open('events-manager', 'organizer');
    expect(buttons(organizer)).toContain('Register to an event');
    expect(buttons(organizer)).not.toContain('Ban');
    expect(organizer.text()).not.toContain('alex@epitech.eu');
  });

  it('offers site admins the ghost actions', async () => {
    const names = buttons(await open('admin', 'ghost'));
    expect(names).toEqual(
      expect.arrayContaining(['Edit details', 'Register to an event', 'Delete the ghost']),
    );
    expect(names).not.toContain('Warn');
  });

  it('gives events managers no Edit or Delete for a ghost', async () => {
    const names = buttons(await open('events-manager', 'ghost'));
    expect(names).toContain('Register to an event');
    expect(names).not.toContain('Edit details');
    expect(names).not.toContain('Delete the ghost');
  });
});

describe('the Person page tabs', () => {
  it('gives each role its tabs', async () => {
    expect(tabLinks(await open('warden-admin', 'clean'))).toEqual([
      'Summary',
      'Minecraft',
      'Moderation',
      'Playtime',
      'Anticheat',
    ]);
    expect(tabLinks(await open('events-manager', 'organizer'))).toEqual(['Summary', 'Events']);
    expect(tabLinks(await open('economy-admin', 'bank'))).toEqual(['Summary', 'LNBits']);
  });

  it('gives a ghost only Summary, Events and Site account', async () => {
    expect(tabLinks(await open('admin', 'ghost'))).toEqual(['Summary', 'Events', 'Site account']);
  });

  it('sends a forbidden tab back to the summary', async () => {
    await open('events-manager', 'organizer', 'moderation');
    expect(useRoute().path).toBe('/admin/people/organizer/summary');
  });

  it('shows the Events tab registrations', async () => {
    const page = await open('events-manager', 'organizer', 'events');
    expect(page.text()).toContain('Rocket League night');
    expect(page.text()).toContain('Registered');
  });

  it('shows the Summary cards the role may read', async () => {
    const warden = await open('warden-admin', 'banned');
    expect(warden.text()).toContain('AlexCraft');
    expect(warden.text()).toContain('1 ban, 2 warnings, no notes');
    expect(warden.find('[aria-label="Open Moderation"]').exists()).toBe(true);
    expect(warden.text()).toContain('1 file to look at.');
    const bank = await open('economy-admin', 'bank');
    expect(bank.text()).toContain('420 LNBits');
    expect(bank.text()).not.toContain('warnings');
  });
});
