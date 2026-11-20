import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it } from 'vitest';

import MarketPage from '~/pages/minecraft/market.vue';

import type { MarketPublic } from '#shared/schemas/market';

const item = (id: string, name: string, tier: number, deltaPercent: number, buyable: boolean) => ({
  id,
  name,
  tier,
  sellable: true,
  buyable,
  price: 0.05,
  p0: 0.05,
  deltaPercent,
  sell: { one: 4, stack: 270 },
  buy: { one: 6, stack: 380 },
  sparkline: [0.04, 0.05],
});

const window = {
  tier: 1,
  nominal: 2000,
  rate: 1,
  toNextBracket: 3000,
  q1: 5000,
  q2: 15000,
  nextRate: 0.5,
};
let page: MarketPublic;

registerEndpoint('/api/market', () => page);

async function mountPage(user: object | null) {
  clearNuxtData('market-public');
  useState('auth-session').value = user ? { user } : null;
  useState('auth-session-loaded').value = true;
  return mountSuspended(MarketPage, { route: '/minecraft/market' });
}

beforeEach(() => {
  page = {
    items: [
      item('minecraft:cobblestone', 'Cobblestone', 1, 25, true),
      item('minecraft:diamond', 'Diamond', 3, -35, false),
    ],
    sell: true,
    buy: true,
  };
});

describe('the public Market page', () => {
  it('asks signed-out visitors to sign in and lists the items by tier', async () => {
    const text = (await mountPage(null)).text();
    expect(text).toContain('Sign in');
    expect(text).toContain('Cobblestone');
    expect(text).toContain('Tier 3');
    expect(text).toContain('Not sold');
    expect(text).toContain('Paying the most');
    expect(text).not.toContain('Your day at the Market');
  });

  it('asks a signed-in player without a linked account to link it', async () => {
    const text = (await mountPage({ id: 'u1', tenantId: 'x' })).text();
    expect(text).toContain('Link my account');
  });

  it('shows a meter per tier and the reduced-pay notice to a linked player', async () => {
    page.me = { tiers: [window], capped: true };
    const view = await mountPage({ id: 'u1', tenantId: 'x' });
    expect(view.text()).toContain('Your day at the Market');
    expect(view.text()).toContain('3,000 LNBits more at the full rate');
    expect(view.text()).toContain('reduced');
    expect(view.find('[role="meter"]').exists()).toBe(true);
  });

  it('says when selling or buying is off', async () => {
    page.buy = false;
    expect((await mountPage(null)).text()).toContain('Buying is off');
  });

  it('shows an empty state when there is no item', async () => {
    page.items = [];
    expect((await mountPage(null)).text()).toContain('Nothing is for sale yet');
  });
});
