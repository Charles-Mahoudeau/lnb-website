import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it } from 'vitest';

import WardenPage from '~/pages/minecraft/warden.vue';

import type { WardenMe } from '#shared/schemas/warden';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';

function me(overrides: Partial<WardenMe> = {}): WardenMe {
  return {
    serverUrl: 'abcdefghijklmnopqrstuvwxyz.mc.bde-teknantes.fr',
    tokenRotatedAt: '2026-10-15T12:00:00.000Z',
    showRealName: true,
    shortName: 'Alex L.',
    limit: { used: 1, max: 1 },
    accounts: [
      {
        uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
        username: 'Renard_Lunaire',
        cracked: false,
        linkedAt: '2026-10-02T12:00:00.000Z',
        lastSeenAt: '2026-10-15T12:00:00.000Z',
        online: true,
        playtimeSeconds: 41 * 3600 + 12 * 60,
        pastUsernames: [],
      },
    ],
    totals: { playtimeSeconds: 41 * 3600 + 12 * 60, lastSeenAt: '2026-10-15T12:00:00.000Z' },
    activeBan: null,
    history: [],
    sessions: { items: [], nextCursor: null },
    ...overrides,
  };
}

let current = me();
registerEndpoint('/api/warden/me', () => current);

const session = { user: { id: 'u1', name: 'Alex Laurent', tenantId: EPITECH }, session: {} };
registerEndpoint('/api/auth/get-session', () => session);

describe('/minecraft/warden', () => {
  beforeEach(() => {
    clearNuxtData('warden-me');
  });

  it('shows the linked account, its state and the nametag', async () => {
    current = me();
    const page = await mountSuspended(WardenPage);
    const text = page.text();
    expect(text).toContain('Renard_Lunaire');
    expect(text).toContain('Playing now');
    expect(text).toContain('Premium account');
    expect(text).toContain('1 out of 1 account linked');
    expect(page.find('.nametag').text()).toContain('Alex L.');
    expect(text).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('shows an active ban and offers an appeal', async () => {
    current = me({
      activeBan: {
        id: 'b1',
        reason: 'Griefing at spawn',
        createdAt: '2026-10-15T12:00:00.000Z',
        expiresAt: null,
        appeal: null,
      },
    });
    const page = await mountSuspended(WardenPage);
    expect(page.text()).toContain('You can’t join the server');
    expect(page.text()).toContain('Griefing at spawn');
    expect(page.text()).toContain('This ban is permanent.');
    expect(page.text()).toContain('Appeal this ban');
  });
});
