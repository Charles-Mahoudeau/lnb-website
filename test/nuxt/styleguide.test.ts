import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import { UApp } from '#components';
import StyleguidePage from '~/pages/styleguide.vue';

describe('style guide page', () => {
  it('renders the themed components', async () => {
    // Inside UApp, as app.vue renders it: the mod list's tooltips need its provider.
    const page = await mountSuspended(
      defineComponent({ render: () => h(UApp, null, () => h(StyleguidePage)) }),
    );
    expect(page.text()).toContain('Style guide');
    const register = page.findAll('button').find((button) => button.text() === 'Register');
    expect(register?.classes()).toContain('bg-action');
  });
});
