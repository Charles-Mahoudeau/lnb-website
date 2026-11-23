import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { createError } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import AnnouncerPill from '~/components/admin/feed/AnnouncerPill.vue';
import AnnouncerRow from '~/components/admin/feed/AnnouncerRow.vue';
import AdminPeople from '~/components/admin/People.vue';
import PersonPage from '~/pages/admin/people/[userId]/[tab].vue';

import { clearPortals, clearToasts, deferred, inApp, settle, toastTitles } from './feed-fixtures';

import type { FeedAnnouncerState } from '#shared/schemas/feed';

// The announcer switch of the Person page's Minecraft tab, its pill, and the People role filter's
// new choice (docs/feed.md, "Granting the announcer role" and "Moderation").

vi.setConfig({ testTimeout: 30_000 });

// $fetch is an auto-import: wrapped so a test can stand in for the PUT, while the real one answers
// the rest from the registered endpoints.
const real = vi.hoisted(() => ({
  fetch: undefined as unknown as (url: string, options?: unknown) => unknown,
}));
mockNuxtImport('$fetch', (original) => {
  real.fetch = original as never;
  return vi.fn(original);
});

const puts: { url: string; method?: string; body: unknown }[] = [];
/** Answers the PUT of the announcer route, recording what the page sent. */
function onPut(
  userId: string,
  answer: (announcer: boolean) => FeedAnnouncerState | Promise<unknown>,
) {
  const path = `/api/feed/admin/announcers/${userId}`;
  vi.mocked($fetch).mockImplementation(((url: string, options?: Record<string, unknown>) => {
    if (url !== path || options?.method !== 'PUT') return real.fetch(url, options);
    puts.push({ url, method: 'PUT', body: options.body });
    return Promise.resolve(answer((options.body as { announcer: boolean }).announcer));
  }) as never);
}
/** Refuses the PUT as the route does. */
function refusePut(userId: string, status: number, problem?: string) {
  const path = `/api/feed/admin/announcers/${userId}`;
  vi.mocked($fetch).mockImplementation(((url: string, options?: Record<string, unknown>) => {
    if (url !== path || options?.method !== 'PUT') return real.fetch(url, options);
    puts.push({ url, method: 'PUT', body: options.body });
    return Promise.reject(
      Object.assign(new Error(String(status)), {
        data: { statusCode: status, data: problem ? { problem } : undefined },
      }),
    );
  }) as never);
}

function signIn(role: string) {
  useState('auth-session').value = { user: { id: 'me', name: 'Me', role, tenantId: 'x' } };
  useState('auth-session-loaded').value = true;
}

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const view of mounted.splice(0)) view.unmount();
  vi.mocked($fetch).mockReset();
});
beforeEach(() => {
  clearNuxtData();
  clearToasts();
  clearPortals();
  puts.length = 0;
});

function serveState(state: FeedAnnouncerState) {
  registerEndpoint(`/api/feed/admin/announcers/${state.userId}`, {
    method: 'GET',
    handler: () => state,
  });
}

async function mountRow(state: FeedAnnouncerState, name = 'Léa B.') {
  signIn('warden-admin');
  serveState(state);
  const view = await mountSuspended(inApp(AnnouncerRow, { userId: state.userId, name }));
  mounted.push(view);
  await settle(5);
  return view;
}
const toggle = (view: Awaited<ReturnType<typeof mountRow>>) => view.find('[role="switch"]');

describe('the announcer switch', () => {
  it('shows a plain player off and enabled, and gives the role with one request', async () => {
    onPut('u-lea', (announcer) => ({ userId: 'u-lea', announcer, viaRole: false }));
    const view = await mountRow({ userId: 'u-lea', announcer: false, viaRole: false });
    expect(view.text()).toContain('Feed announcer');
    expect(view.text()).toContain('Can post in Announcements and pin.');
    expect(view.text()).not.toContain('by role, as a moderator');
    expect(toggle(view).attributes('data-state')).toBe('unchecked');
    expect(toggle(view).attributes('disabled')).toBeUndefined();
    await toggle(view).trigger('click');
    await vi.waitFor(() => {
      expect(toggle(view).attributes('data-state')).toBe('checked');
    });
    expect(puts).toEqual([
      { url: '/api/feed/admin/announcers/u-lea', method: 'PUT', body: { announcer: true } },
    ]);
    expect(toastTitles()).toEqual(['Léa B. is now a Feed announcer']);
  });

  it('shows an announcer on, and takes the role with one request', async () => {
    onPut('u-theo', (announcer) => ({ userId: 'u-theo', announcer, viaRole: false }));
    const view = await mountRow({ userId: 'u-theo', announcer: true, viaRole: false }, 'Théo C.');
    expect(toggle(view).attributes('data-state')).toBe('checked');
    await toggle(view).trigger('click');
    await vi.waitFor(() => {
      expect(toggle(view).attributes('data-state')).toBe('unchecked');
    });
    expect(puts.map((put) => put.body)).toEqual([{ announcer: false }]);
    expect(toastTitles()).toEqual(['Théo C. is no longer a Feed announcer']);
  });

  it('shows a banned announcer or one with no linked account on and enabled, as the route says', async () => {
    // The route answers the role, not the right: a banned announcer reads as an announcer.
    onPut('u-ban', (announcer) => ({ userId: 'u-ban', announcer, viaRole: false }));
    const view = await mountRow({ userId: 'u-ban', announcer: true, viaRole: false }, 'Banni');
    expect(toggle(view).attributes('data-state')).toBe('checked');
    expect(toggle(view).attributes('disabled')).toBeUndefined();
    await toggle(view).trigger('click');
    await vi.waitFor(() => {
      expect(toggle(view).attributes('data-state')).toBe('unchecked');
    });
  });

  it('shows a moderator on and disabled with the reason, and never sends a request', async () => {
    onPut('u-ines', () => {
      throw new Error('no request expected');
    });
    const view = await mountRow({ userId: 'u-ines', announcer: true, viaRole: true }, 'Inès R.');
    expect(toggle(view).attributes('data-state')).toBe('checked');
    expect(toggle(view).attributes('disabled')).toBeDefined();
    expect(view.text()).toContain('An announcer by role, as a moderator');
    await toggle(view).trigger('click');
    await settle(10);
    expect(puts).toEqual([]);
    expect(toggle(view).attributes('data-state')).toBe('checked');
    expect(toastTitles()).toEqual([]);
  });

  it('is described by its label and its text, for a screen reader', async () => {
    const view = await mountRow({ userId: 'u-lea', announcer: false, viaRole: false });
    const labelled = toggle(view).attributes('aria-labelledby');
    const described = toggle(view).attributes('aria-describedby');
    expect(view.find(`#${labelled!}`).text()).toBe('Feed announcer');
    expect(view.find(`#${described!}`).text()).toContain('Moderators are announcers by role');
  });

  it('is disabled while the request is on its way, and takes the state the server answers', async () => {
    const slow = deferred<FeedAnnouncerState>();
    onPut('u-lea', () => slow.promise);
    const view = await mountRow({ userId: 'u-lea', announcer: false, viaRole: false });
    await toggle(view).trigger('click');
    await settle(5);
    expect(toggle(view).attributes('disabled')).toBeDefined();
    await toggle(view).trigger('click');
    expect(puts).toHaveLength(1);
    // Meanwhile the person became a moderator: the answer is what the switch shows.
    slow.resolve({ userId: 'u-lea', announcer: true, viaRole: true });
    await vi.waitFor(() => {
      expect(view.text()).toContain('An announcer by role');
    });
    expect(toggle(view).attributes('data-state')).toBe('checked');
    expect(toggle(view).attributes('disabled')).toBeDefined();
  });

  const refusals: [string, number, string | undefined, string][] = [
    ['a server error', 500, undefined, 'The announcer role couldn’t be changed'],
    ['a moderator’s role taken', 409, 'impliedByRole', 'Moderators are announcers by role'],
    ['a ghost account', 409, 'isGhost', 'A ghost account can’t be an announcer'],
    ['an account that is gone', 404, 'notFound', 'This account no longer exists'],
    ['a problem it does not know', 409, 'somethingNew', 'The announcer role couldn’t be changed'],
  ];
  for (const [label, status, problem, expected] of refusals) {
    it(`says why for ${label}, and leaves the switch where it was`, async () => {
      refusePut('u-lea', status, problem);
      const view = await mountRow({ userId: 'u-lea', announcer: false, viaRole: false });
      await toggle(view).trigger('click');
      await vi.waitFor(() => {
        expect(toastTitles().some((title) => title.includes(expected))).toBe(true);
      });
      await settle(5);
      expect(toggle(view).attributes('data-state')).toBe('unchecked');
      expect(toggle(view).attributes('disabled')).toBeUndefined();
      expect(toastTitles().some((title) => title.includes('is now a Feed announcer'))).toBe(false);
    });
  }

  it('lets the moderator try again after a failure', async () => {
    refusePut('u-lea', 500);
    const view = await mountRow({ userId: 'u-lea', announcer: false, viaRole: false });
    await toggle(view).trigger('click');
    await vi.waitFor(() => {
      expect(toastTitles()).toHaveLength(1);
    });
    onPut('u-lea', (announcer) => ({ userId: 'u-lea', announcer, viaRole: false }));
    await settle(5);
    await toggle(view).trigger('click');
    await vi.waitFor(() => {
      expect(toggle(view).attributes('data-state')).toBe('checked');
    });
  });

  it('says the role did not load, with no switch to press, when the state cannot be read', async () => {
    signIn('warden-admin');
    registerEndpoint('/api/feed/admin/announcers/u-broken', () => {
      throw createError({ status: 500 });
    });
    const view = await mountSuspended(inApp(AnnouncerRow, { userId: 'u-broken', name: 'X' }));
    mounted.push(view);
    await settle(5);
    expect(view.text()).toContain('The Feed announcer role didn’t load');
    expect(view.find('[role="switch"]').exists()).toBe(false);
  });
});

describe('the announcer pill', () => {
  const pill = async (state: FeedAnnouncerState) => {
    signIn('warden-admin');
    serveState(state);
    const view = await mountSuspended(AnnouncerPill, { props: { userId: state.userId } });
    mounted.push(view);
    await settle(5);
    return view;
  };

  it('shows Announcer for the role, by role and for a banned announcer', async () => {
    for (const state of [
      { userId: 'p-theo', announcer: true, viaRole: false },
      { userId: 'p-ines', announcer: true, viaRole: true },
    ]) {
      const view = await pill(state);
      expect(view.text(), state.userId).toBe('Announcer');
    }
  });

  it('shows nothing for a person who is not one', async () => {
    const view = await pill({ userId: 'p-lea', announcer: false, viaRole: false });
    expect(view.text()).toBe('');
  });

  it('shows nothing, and does not break, when the state cannot be read', async () => {
    signIn('warden-admin');
    registerEndpoint('/api/feed/admin/announcers/p-broken', () => {
      throw createError({ status: 500 });
    });
    const view = await mountSuspended(AnnouncerPill, { props: { userId: 'p-broken' } });
    mounted.push(view);
    await settle(5);
    expect(view.text()).toBe('');
  });

  it('follows the switch: the pill appears when the role is given, and goes when it is taken', async () => {
    signIn('warden-admin');
    serveState({ userId: 'p-both', announcer: false, viaRole: false });
    onPut('p-both', (announcer) => ({ userId: 'p-both', announcer, viaRole: false }));
    const both = defineComponent({
      render: () => [
        h(AnnouncerPill, { userId: 'p-both' }),
        h(AnnouncerRow, { userId: 'p-both', name: 'Les Deux' }),
      ],
    });
    const view = await mountSuspended(inApp(both));
    mounted.push(view);
    await settle(5);
    const badges = () => view.findAll('span').filter((node) => node.text() === 'Announcer');
    expect(badges()).toHaveLength(0);
    await view.find('[role="switch"]').trigger('click');
    await vi.waitFor(() => {
      expect(badges().length).toBeGreaterThan(0);
    });
    await view.find('[role="switch"]').trigger('click');
    await vi.waitFor(() => {
      expect(badges()).toHaveLength(0);
    });
  });
});

describe('the pill in the header of the Person page', () => {
  const summary = (userId: string, over: Record<string, unknown> = {}) => ({
    userId,
    name: 'Alex Laurent',
    image: null,
    school: 'Epitech',
    ghost: false,
    createdAt: '2025-09-01T12:00:00.000Z',
    email: 'alex@epitech.eu',
    roles: { admin: false, wardenAdmin: false, eventsManager: false, economyAdmin: false },
    ...over,
  });
  let announcerCalls: string[] = [];
  function serve(userId: string, over: Record<string, unknown> = {}, state?: FeedAnnouncerState) {
    registerEndpoint(`/api/admin/people/${userId}/summary`, () => summary(userId, over));
    registerEndpoint(`/api/feed/admin/announcers/${userId}`, () => {
      announcerCalls.push(userId);
      return state ?? { userId, announcer: true, viaRole: false };
    });
  }
  beforeEach(() => {
    announcerCalls = [];
  });

  it('shows the pill to a Warden admin for an announcer', async () => {
    serve('hp-announcer');
    signIn('warden-admin');
    const page = await mountSuspended(PersonPage, { route: '/admin/people/hp-announcer/summary' });
    mounted.push(page);
    await settle(10);
    expect(page.findAll('span').some((node) => node.text() === 'Announcer')).toBe(true);
  });

  it('shows nothing for a person who is not an announcer', async () => {
    serve('hp-plain', {}, { userId: 'hp-plain', announcer: false, viaRole: false });
    signIn('admin');
    const page = await mountSuspended(PersonPage, { route: '/admin/people/hp-plain/summary' });
    mounted.push(page);
    await settle(10);
    expect(page.findAll('span').some((node) => node.text() === 'Announcer')).toBe(false);
  });

  it('asks nothing of the announcer route for an events manager, and shows no pill', async () => {
    serve('hp-events');
    signIn('events-manager');
    const page = await mountSuspended(PersonPage, { route: '/admin/people/hp-events/summary' });
    mounted.push(page);
    await settle(10);
    expect(announcerCalls).toEqual([]);
    expect(page.findAll('span').some((node) => node.text() === 'Announcer')).toBe(false);
  });

  it('asks nothing of it for an economy admin either', async () => {
    serve('hp-economy');
    signIn('economy-admin');
    const page = await mountSuspended(PersonPage, { route: '/admin/people/hp-economy/summary' });
    mounted.push(page);
    await settle(10);
    expect(announcerCalls).toEqual([]);
  });

  it('shows no pill, and asks nothing, for a ghost account', async () => {
    serve('hp-ghost', { ghost: true, tenantId: 'x', siteBan: null, events: { registrations: [] } });
    signIn('warden-admin');
    const page = await mountSuspended(PersonPage, { route: '/admin/people/hp-ghost/summary' });
    mounted.push(page);
    await settle(10);
    expect(announcerCalls).toEqual([]);
    expect(page.findAll('span').some((node) => node.text() === 'Announcer')).toBe(false);
  });
});

describe('the People role filter', () => {
  const queries: Record<string, string>[] = [];
  beforeEach(() => {
    queries.length = 0;
    registerEndpoint('/api/admin/people', (event) => {
      queries.push(Object.fromEntries(new URL(event.path, 'http://localhost').searchParams));
      return { items: [], nextCursor: null, total: 0, match: null };
    });
  });

  it('offers Feed announcer, and sends it as the role', async () => {
    signIn('admin');
    const view = await mountSuspended(AdminPeople);
    mounted.push(view);
    await settle(10);
    await view.find('[aria-label="Roles"]').trigger('click');
    await settle(10);
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.map((option) => option.textContent.trim())).toEqual([
      'Any role',
      'Admin',
      'Warden admin',
      'Events manager',
      'Economy admin',
      'Feed announcer',
    ]);
    const choice = options.at(-1)!;
    choice.focus();
    choice.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => {
      expect(queries.some((query) => query.role === 'feed-announcer')).toBe(true);
    });
    await settle(10);
    expect(view.find('[aria-label="Roles"]').text()).toContain('Feed announcer');
  });
});
