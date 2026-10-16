import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import AdminFlags from '~/components/admin/Flags.vue';

import type { AdminFlag } from '#shared/schemas/flags';

function flag(overrides: Partial<AdminFlag> & Pick<AdminFlag, 'key'>): AdminFlag {
  return {
    parent: null,
    enabled: true,
    effective: true,
    updatedAt: null,
    updatedByName: null,
    ...overrides,
  };
}

registerEndpoint('/api/admin/flags', () => ({
  items: [
    flag({ key: 'modList', enabled: false, effective: false }),
    flag({ key: 'modList.voting', parent: 'modList', effective: false }),
    flag({ key: 'appLinking' }),
  ],
}));

describe('admin feature flags', () => {
  it('shows each feature with its parts, and says when the parts are off', async () => {
    const page = await mountSuspended(AdminFlags);
    const text = page.text();
    expect(text).toContain('Mod list');
    expect(text).toContain('Voting');
    expect(text).toContain('App linking');
    expect(text).toContain('its parts are off too');
  });
});
