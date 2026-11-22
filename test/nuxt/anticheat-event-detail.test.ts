import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import AdminAnticheatEventDetail from '~/components/admin/anticheat/EventDetail.vue';

describe('anticheat event detail', () => {
  it('lists the missing mods of an incomplete modlist', async () => {
    await mountSuspended(AdminAnticheatEventDetail, {
      props: {
        open: true,
        event: {
          id: 1,
          kind: 'modlistIncomplete',
          delta: -40,
          applied: true,
          scoreAfter: 20,
          actor: null,
          data: { missing: ['Sodium', 'Lithium'], reportId: 'r1' },
          at: '2026-11-22T20:58:00.000Z',
        },
      },
    });
    const text = document.body.textContent;
    expect(text).toContain('Modlist incomplete');
    expect(text).toContain('Missing mods');
    expect(text).toContain('Sodium');
    expect(text).toContain('Lithium');
    expect(text).toContain('−40');
  });
});
