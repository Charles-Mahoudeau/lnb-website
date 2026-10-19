import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import SiteFooter from '~/components/SiteFooter.vue';

describe('site footer', () => {
  it('lists the pages and the project links', async () => {
    const footer = await mountSuspended(SiteFooter);
    const text = footer.text();
    expect(text).toContain('Events');
    expect(text).toContain('Mods');
    expect(text).toContain('Source code');
    expect(text).toContain('AGPL-3.0');
  });

  it('keeps the language and theme pickers on the account page', async () => {
    const footer = await mountSuspended(SiteFooter);
    expect(footer.find('select, [role="radiogroup"]').exists()).toBe(false);
  });
});
