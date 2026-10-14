import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import StyleguidePage from '~/pages/styleguide.vue';

describe('style guide page', () => {
  it('renders the themed components', async () => {
    const page = await mountSuspended(StyleguidePage);
    expect(page.text()).toContain('Style guide');
    expect(page.find('button').classes()).toContain('bg-action');
  });
});
