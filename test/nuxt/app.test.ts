import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import IndexPage from '~/pages/index.vue';

describe('home page', () => {
  it('shows the site name', async () => {
    const page = await mountSuspended(IndexPage);
    expect(page.text()).toContain('La Nuit Blanche');
  });
});
