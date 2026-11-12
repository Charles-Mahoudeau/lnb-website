import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import AdminAnticheatCriteria from '~/components/admin/anticheat/Criteria.vue';
import AdminAnticheatFiles from '~/components/admin/anticheat/Files.vue';

import type { AnticheatBreakdown, AnticheatFileRow } from '#shared/schemas/anticheat';

function row(overrides: Partial<AnticheatFileRow>): AnticheatFileRow {
  return {
    projectId: null,
    sha512: 'a'.repeat(128),
    kind: 'mod',
    name: 'Sodium',
    fileCount: 1,
    platforms: ['modrinth'],
    status: 'approved',
    score: 92,
    decision: null,
    usingNow: 0,
    everUsed: 3,
    waiting: 0,
    firstSeenAt: '2026-11-01T10:00:00.000Z',
    lastScoredAt: null,
    ...overrides,
  };
}

registerEndpoint('/api/anticheat/admin/files', () => ({
  items: [
    row({ name: 'Sodium', status: 'approved', score: 92 }),
    row({
      sha512: 'b'.repeat(128),
      name: 'Shady Client',
      status: 'refused',
      score: 12,
      platforms: [],
      waiting: 4,
      usingNow: 2,
    }),
    row({ sha512: 'c'.repeat(128), name: 'Fresh Mod', status: null, score: null }),
  ],
  nextCursor: null,
}));

describe('anticheat file registry', () => {
  it('shows each file with its status pill, its score and the waiting players', async () => {
    const page = await mountSuspended(AdminAnticheatFiles);
    const text = page.text();
    expect(text).toContain('Sodium');
    expect(text).toContain('Approved');
    expect(text).toContain('Refused');
    expect(text).toContain('Pending');
    const refused = page.findAll('tr').find((tr) => tr.text().includes('Shady Client'));
    const cells = refused?.findAll('td').map((td) => td.text());
    expect(cells?.[2]).toBe('12');
    expect(cells?.[5]).toBe('4');
    expect(refused?.findAll('td')[5]?.classes()).toContain('text-warning');
  });
});

describe('anticheat criteria', () => {
  const breakdown: AnticheatBreakdown = {
    path: 'computed',
    rulesVersion: 1,
    overrides: [],
    criteria: [
      { key: 'moderationApproved', state: 'earned', points: 20 },
      { key: 'bothPlatforms', state: 'unavailable', points: 10 },
    ],
    fullMax: 100,
    availableMax: 20,
    earned: 20,
    scaled: 100,
    penalties: [{ key: 'texturesAltered', points: -20 }],
    raw: 80,
    score: 80,
  };

  it('lists every criterion and the arithmetic, with a real minus sign', async () => {
    const page = await mountSuspended(AdminAnticheatCriteria, { props: { breakdown } });
    expect(page.text()).toContain('Approved by the platform’s moderation');
    expect(page.text()).toContain('(no data)');
    expect(page.text()).toContain('−20');
    expect(page.text()).toContain('final score 80');
  });

  it('says one sentence for an override', async () => {
    const page = await mountSuspended(AdminAnticheatCriteria, {
      props: { breakdown: { ...breakdown, path: 'banned', overrides: ['project'], score: 0 } },
    });
    expect(page.text()).toContain('Banned: an admin decided on its project. The score is 0.');
    expect(page.findAll('li')).toHaveLength(0);
  });
});
