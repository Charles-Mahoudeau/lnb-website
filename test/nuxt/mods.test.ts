import { mountSuspended } from '@nuxt/test-utils/runtime';
import type { VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import type { Component } from 'vue';

import { ModsRow, ModsVoteControl, UApp } from '#components';

import type { ModView } from '#shared/schemas/mods';

function mod(overrides: Partial<ModView> = {}): ModView {
  return {
    id: 1,
    list: 'suggestion',
    source: 'modrinth',
    name: 'Farmer’s Delight',
    summary: 'A cozy expansion to farming and cooking.',
    pageUrl: 'https://modrinth.com/mod/farmers-delight',
    iconUrl: null,
    score: 9,
    up: 11,
    down: 2,
    suggested: true,
    proposerName: 'Léa M.',
    reason: 'Cooking gives everyone something to do between builds.',
    createdAt: '2026-10-14T18:00:00.000Z',
    myVote: 0,
    mine: false,
    ...overrides,
  };
}

const props = { score: 4, up: 5, down: 1, name: 'Sodium' };

/** Mounts a component inside UApp, which provides tooltips, as app.vue does. */
// `unknown`: ESLint's type service doesn't resolve .vue components, so they'd read as errors.
async function mountInApp(target: unknown, componentProps: object) {
  const component = target as Component;
  const root = await mountSuspended(
    defineComponent({ render: () => h(UApp, null, () => h(component, componentProps)) }),
  );
  return { root, inner: root.findComponent(component) as VueWrapper };
}

function buttons(wrapper: VueWrapper) {
  const all = wrapper.findAll('button');
  return {
    up: all.find((b) => b.attributes('aria-label') === 'Upvote')!,
    down: all.find((b) => b.attributes('aria-label') === 'Downvote')!,
  };
}

describe('vote control', () => {
  it('sets a vote, and clears it when clicked again', async () => {
    const { inner: none } = await mountInApp(ModsVoteControl, { ...props, myVote: 0 });
    await buttons(none).up.trigger('click');
    expect(none.emitted('vote')).toEqual([[1]]);

    const { inner: upvoted } = await mountInApp(ModsVoteControl, { ...props, myVote: 1 });
    expect(buttons(upvoted).up.attributes('aria-pressed')).toBe('true');
    await buttons(upvoted).up.trigger('click');
    await buttons(upvoted).down.trigger('click');
    expect(upvoted.emitted('vote')).toEqual([[0], [-1]]);
  });

  it('is disabled with a reason', async () => {
    const { inner: blocked } = await mountInApp(ModsVoteControl, {
      ...props,
      myVote: 0,
      blocked: 'Voting is closed',
    });
    expect(buttons(blocked).up.attributes('disabled')).toBeDefined();
    expect(buttons(blocked).down.attributes('disabled')).toBeDefined();
  });

  it('shows the score', async () => {
    const { inner: control } = await mountInApp(ModsVoteControl, { ...props, myVote: 0 });
    expect(control.text()).toContain('4');
  });
});

describe('mod row', () => {
  it('shows the reason and who suggested it', async () => {
    const { inner: row } = await mountInApp(ModsRow, { mod: mod(), blocked: null });
    expect(row.text()).toContain('Farmer’s Delight');
    expect(row.text()).toContain('Cooking gives everyone');
    expect(row.text()).toContain('Suggested by Léa M.');
    expect(row.text()).not.toContain('Withdraw');
  });

  it('names a deleted proposer as a former member', async () => {
    const { inner: row } = await mountInApp(ModsRow, {
      mod: mod({ proposerName: null }),
      blocked: null,
    });
    expect(row.text()).toContain('Suggested by a former member');
  });

  it('lets you edit or withdraw your own suggestion, but not vote on it', async () => {
    const { inner: row } = await mountInApp(ModsRow, { mod: mod({ mine: true }), blocked: null });
    expect(row.text()).toContain('Your suggestion');
    expect(row.text()).toContain('Withdraw');
    expect(buttons(row).up.attributes('disabled')).toBeDefined();
  });

  it('shows no reason for mods added by admins', async () => {
    const { inner: row } = await mountInApp(ModsRow, {
      mod: mod({ list: 'official', reason: null, proposerName: null, suggested: false }),
      blocked: null,
    });
    expect(row.text()).not.toContain('Suggested by');
  });
});
