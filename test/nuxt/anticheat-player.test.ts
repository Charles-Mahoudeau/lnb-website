import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';

import AdminAnticheatPlayerPanel from '~/components/admin/anticheat/PlayerPanel.vue';

import type { AnticheatPlayerDetail } from '#shared/schemas/anticheat';

const detail: AnticheatPlayerDetail = {
  player: { userId: 'u1', name: 'Ada', username: 'AdaMC' },
  score: 42,
  band: 'held',
  adjustment: -3,
  manualHold: true,
  holdReason: 'Asked to explain a mod',
  holdAt: '2026-11-02T10:00:00.000Z',
  events: {
    items: [
      {
        id: 2,
        kind: 'challengeWrong',
        delta: -10,
        applied: false,
        scoreAfter: 42,
        actor: null,
        data: {},
        at: '2026-11-03T10:00:00.000Z',
      },
      {
        id: 1,
        kind: 'adminAdjust',
        delta: 7,
        applied: true,
        scoreAfter: 52,
        actor: 'admin',
        data: { reason: 'Cleared after a talk' },
        at: '2026-11-02T10:00:00.000Z',
      },
    ],
    nextCursor: null,
  },
  files: [],
  reportAt: null,
  usage: [],
  actions: [],
};

registerEndpoint('/api/anticheat/admin/players/u1', () => detail);

describe('anticheat player panel', () => {
  it('shows the score, the band sentence and the manual hold', async () => {
    const panel = await mountSuspended(AdminAnticheatPlayerPanel, { props: { userId: 'u1' } });
    await vi.waitFor(() => {
      expect(panel.text()).toContain('42');
    });
    expect(panel.text()).toContain('Held. The score is low');
    expect(panel.text()).toContain('Asked to explain a mod');
    expect(panel.text()).toContain('Clear the hold');
    expect(panel.text()).toContain('−3');
  });

  it('renders the timeline with a real minus sign, and hints at what was not applied', async () => {
    const panel = await mountSuspended(AdminAnticheatPlayerPanel, { props: { userId: 'u1' } });
    await vi.waitFor(() => {
      expect(panel.findAll('[data-testid="timeline-event"]')).toHaveLength(2);
    });
    const [observed, adjusted] = panel.findAll('[data-testid="timeline-event"]');
    expect(observed?.text()).toContain('−10');
    expect(observed?.text()).toContain('Not applied (observe)');
    expect(observed?.find('.font-display').classes()).toContain('text-muted');
    expect(adjusted?.text()).toContain('+7');
    expect(adjusted?.text()).toContain('Cleared after a talk');
    expect(adjusted?.text()).not.toContain('Not applied');
  });
});
