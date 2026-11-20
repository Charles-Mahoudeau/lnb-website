import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';

import AdminSearch from '~/components/admin/Search.vue';

const queries: string[] = [];
registerEndpoint('/api/admin/people', (event) => {
  queries.push(new URL(event.path, 'http://localhost').searchParams.get('q') ?? '');
  return {
    items: [
      {
        userId: 'p1',
        name: 'Alex Laurent',
        image: null,
        school: 'Epitech',
        ghost: false,
      },
    ],
    total: 1,
    nextCursor: null,
  };
});

function signIn(role: string) {
  useState('auth-session').value = { user: { id: 'u1', name: 'Test', role, tenantId: 'x' } };
  useState('auth-session-loaded').value = true;
}

/** Opens the palette and returns the text it shows. */
async function open(role: string) {
  signIn(role);
  const search = await mountSuspended(AdminSearch, { props: { open: true } });
  await vi.waitFor(() => {
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
  });
  return { search, text: document.body.textContent };
}

describe('Ctrl K search', () => {
  it('gives an events manager their pages, settings and actions, and nothing of the Warden', async () => {
    const { text } = await open('events-manager');
    expect(text).toContain('Pages');
    expect(text).toContain('Short links');
    expect(text).toContain('Rooms');
    expect(text).toContain('New event');
    expect(text).toContain('New short link');
    expect(text).not.toContain('Ban a player');
    expect(text).not.toContain('Adjust a balance');
    expect(text).not.toContain('Moderation');
    expect(text).not.toContain('Anticheat');
  });

  it('gives a Warden admin the moderation actions, and an economy admin the economy ones', async () => {
    let { text } = await open('warden-admin');
    expect(text).toContain('Ban a player');
    expect(text).toContain('Moderation › Appeals');
    expect(text).not.toContain('New event');
    expect(text).not.toContain('Adjust a balance');
    document.body.innerHTML = '';
    ({ text } = await open('economy-admin'));
    expect(text).toContain('Adjust a balance');
    expect(text).toContain('Quests');
    expect(text).not.toContain('Ban a player');
  });

  it('gives a site admin every action', async () => {
    const { text } = await open('admin');
    for (const label of ['Ban a player', 'New event', 'Adjust a balance', 'New short link']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('Feature flags');
  });

  it('searches people after a pause and shows their school, linking to the Person page', async () => {
    await open('warden-admin');
    const input = document.body.querySelector('input')!;
    input.value = 'alex';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Alex Laurent');
    });
    expect(queries).toContain('alex');
    expect(document.body.textContent).toContain('Epitech');
    const link = [...document.body.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Alex Laurent'),
    );
    expect(link!.getAttribute('href')).toBe('/admin/people/p1/summary');
  });
});
