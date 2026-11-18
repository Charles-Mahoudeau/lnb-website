import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import RulesCategory from '~/components/rules/Category.vue';
import RulesCited from '~/components/rules/Cited.vue';

import type { RuleCitation, RulePublicCategory } from '#shared/schemas/rules';

const category: RulePublicCategory = {
  id: 'c1',
  number: 2,
  icon: 'shield-check',
  name: { en: 'Cheating and mods', fr: 'Triche et mods' },
  rules: [
    {
      id: 'r1',
      ref: 7,
      number: '2.1',
      title: { en: 'No cheating', fr: 'Pas de triche' },
      text: { en: 'No x-ray or fly.', fr: '' },
    },
  ],
};

describe('rules category', () => {
  it('shows the number, the name and, once open, each rule with its anchor', async () => {
    const view = await mountSuspended(RulesCategory, {
      props: { category, open: true, highlighted: 'r7' },
    });
    const text = view.text();
    expect(text).toContain('2.');
    expect(text).toContain('Cheating and mods');
    expect(text).toContain('1 rule');
    expect(text).toContain('No cheating');
    // French is empty, so the English text shows.
    expect(text).toContain('No x-ray or fly.');
    expect(view.find('#r7').exists()).toBe(true);
    expect(view.find('#r7').classes()).toContain('bg-secondary/15');
  });

  it('keeps the rules out of sight while closed', async () => {
    const view = await mountSuspended(RulesCategory, { props: { category, open: false } });
    expect(view.text()).toContain('Cheating and mods');
    expect(view.text()).not.toContain('No x-ray or fly.');
  });
});

describe('cited rules', () => {
  const rules: RuleCitation[] = [
    { ruleId: 'a', ref: 7, number: '2.1', title: { en: 'No cheating', fr: '' } },
  ];

  it('links each rule to its anchor on the rules page', async () => {
    const view = await mountSuspended(RulesCited, { props: { rules } });
    expect(view.text()).toContain('2.1');
    expect(view.text()).toContain('No cheating');
    expect(view.find('a').attributes('href')).toBe('/minecraft/rules#r7');
  });

  it('renders nothing for a sanction that names no rule', async () => {
    const view = await mountSuspended(RulesCited, { props: { rules: [] } });
    expect(view.find('ul').exists()).toBe(false);
  });
});
