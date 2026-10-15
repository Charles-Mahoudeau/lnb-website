import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import type { VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import ManualLink from '~/components/warden/admin/ManualLink.vue';

import type { WardenManualLinkView, WardenMinecraftLookup } from '#shared/schemas/warden';

const JEB = '853c80ef-3c37-49fd-aa49-938b674adae6';
const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

function view(overrides: Partial<WardenManualLinkView> = {}): WardenManualLinkView {
  return {
    id: 'r1',
    userCode: '648315',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    verificationUriComplete: 'http://localhost:3000/link?code=648315',
    account: { uuid: JEB, username: 'jeb_', cracked: false },
    for: { userId: 'u1', name: 'Alex Laurent' },
    by: { userId: 'a1', name: 'Test Moderator' },
    status: 'pending',
    linkedBy: null,
    ...overrides,
  };
}

const recent: WardenManualLinkView[] = [
  view({ id: 'r2', status: 'linked', linkedBy: { userId: 'u2', name: 'Inès Moreau' }, for: null }),
  view({ id: 'r3', status: 'cancelled' }),
];
registerEndpoint('/api/warden/admin/link-requests', { method: 'GET', handler: () => recent });

const lookups: Record<string, WardenMinecraftLookup> = {
  jeb_: { uuid: JEB, username: 'jeb_', cracked: false, linkedTo: null },
  notch: {
    uuid: NOTCH,
    username: 'Notch',
    cracked: false,
    linkedTo: { userId: 'u3', name: 'Charles Mahoudeau' },
  },
};
registerEndpoint('/api/warden/admin/minecraft/jeb_', () => lookups.jeb_);
registerEndpoint('/api/warden/admin/minecraft/notch', () => lookups.notch);

const created = vi.fn(() => view());
registerEndpoint('/api/warden/admin/link-requests', { method: 'POST', handler: created });

async function typeUsername(page: VueWrapper, name: string) {
  await page.find('input[autocomplete="off"]').setValue(name);
}

function generateButton(page: VueWrapper) {
  return page.find('button[type="submit"]');
}

describe('manual linking tab', () => {
  it('lists the recent codes with their status', async () => {
    const page = await mountSuspended(ManualLink);
    expect(page.text()).toContain('Recent manual codes');
    expect(page.text()).toContain('Linked by Inès Moreau');
    expect(page.text()).toContain('Cancelled');
    expect(page.text()).toContain('Anyone');
  });

  it('looks the username up, then makes a code', async () => {
    const page = await mountSuspended(ManualLink);
    expect(generateButton(page).attributes('disabled')).toBeDefined();

    await typeUsername(page, 'jeb_');
    await vi.waitFor(() => {
      expect(page.text()).toContain(JEB);
    });
    expect(page.text()).toContain('Found with Mojang');
    expect(generateButton(page).attributes('disabled')).toBeUndefined();

    await page.find('form').trigger('submit');
    await vi.waitFor(() => {
      expect(page.text()).toContain('648 315');
    });
    expect(created).toHaveBeenCalledOnce();
    expect(page.text()).toContain('Premium account, for Alex Laurent only');
    expect(page.find('input[readonly]').element).toHaveProperty(
      'value',
      'http://localhost:3000/link?code=648315',
    );
  });

  it("won't make a code for an account someone already linked", async () => {
    const page = await mountSuspended(ManualLink);
    await typeUsername(page, 'notch');
    await vi.waitFor(() => {
      expect(page.text()).toContain('Notch is already linked');
    });
    expect(page.text()).toContain('Charles Mahoudeau');
    expect(generateButton(page).attributes('disabled')).toBeDefined();
  });
});
