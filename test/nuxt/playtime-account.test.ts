import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import MinecraftAccountPlaytime from '~/components/minecraft-account/Playtime.vue';

import type { PlaytimeMe } from '#shared/schemas/playtime';

function week(overrides: Partial<PlaytimeMe> = {}): PlaytimeMe {
  return {
    mode: 'enforce',
    state: 'counting',
    reason: null,
    weekStart: '2026-11-16',
    playedSeconds: 9.7 * 3600,
    totalPlayedSeconds: 50 * 3600,
    allowanceSeconds: 10 * 3600,
    usedSeconds: 4.17 * 3600,
    remainingSeconds: 5.83 * 3600,
    percentUsed: 42,
    windowEndsAt: '2026-11-18T16:00:00.000Z',
    nextWindowStartsAt: null,
    graceEndsAt: null,
    resumesAt: null,
    resetsAt: '2026-11-22T23:00:00.000Z',
    nextChangeAt: null,
    hours: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], ranges: [['09:00', '17:00']] }],
    accounts: [],
    ...overrides,
  };
}

async function render(me: PlaytimeMe) {
  return mountSuspended(MinecraftAccountPlaytime, { props: { me } });
}

describe('the playtime card', () => {
  it('opens on the hours played, then the state and the allowance', async () => {
    const card = await render(week());
    const text = card.text();
    expect(text).toContain('Counting now');
    expect(text).toContain('until 17:00');
    expect(text).toContain('9 hr 42 min');
    expect(text).toContain('42% used');
    expect(text).toContain('Allowance resets Monday, November 23, 00:00');
    expect(card.get('[data-test="playtime-band"]').attributes('data-tone')).toBe('secondary');
    expect(card.text()).toContain('Monday to Friday, 09:00 to 17:00');
  });

  it('warns in amber when the allowance is almost used', async () => {
    const card = await render(week({ usedSeconds: 8.8 * 3600, remainingSeconds: 1.2 * 3600 }));
    expect(card.get('[data-test="playtime-band"]').attributes('data-tone')).toBe('warning');
  });

  it('shows the grace period in teal with its end', async () => {
    const card = await render(
      week({
        state: 'grace',
        remainingSeconds: 0,
        percentUsed: 100,
        graceEndsAt: '2026-11-18T16:00:00.000Z',
      }),
    );
    expect(card.get('[data-test="playtime-band"]').attributes('data-tone')).toBe('grace');
    expect(card.text()).toContain('Grace period');
    expect(card.text()).toContain('Grace ends today at 17:00');
  });

  it('says when play is back once the allowance is used', async () => {
    const card = await render(
      week({
        state: 'blocked',
        remainingSeconds: 0,
        percentUsed: 100,
        resumesAt: '2026-11-19T08:00:00.000Z',
      }),
    );
    expect(card.get('[data-test="playtime-band"]').attributes('data-tone')).toBe('error');
    expect(card.text()).toContain('Paused');
  });

  it('calls time outside the hours free, with a muted bar', async () => {
    const card = await render(
      week({ state: 'free', windowEndsAt: null, nextWindowStartsAt: '2026-11-19T08:00:00.000Z' }),
    );
    expect(card.get('[data-test="playtime-band"]').attributes('data-tone')).toBe('success');
    expect(card.text()).toContain('Free time');
    expect(card.html()).toContain('bg-dimmed');
  });

  it('has no bar for an exempt account', async () => {
    const card = await render(week({ state: 'unlimited', reason: 'exempt' }));
    expect(card.text()).toContain('No limit');
    expect(card.find('[data-test="playtime-allowance"]').exists()).toBe(false);
  });

  it('tells the player nothing is enforced yet while observing', async () => {
    const card = await render(week({ mode: 'observe' }));
    expect(card.find('[data-test="playtime-observe"]').exists()).toBe(true);
    const enforcing = await render(week());
    expect(enforcing.find('[data-test="playtime-observe"]').exists()).toBe(false);
  });
});
