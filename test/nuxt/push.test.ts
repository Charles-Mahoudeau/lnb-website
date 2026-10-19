import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';

import AdminPush from '~/components/admin/Push.vue';
import PushPrePrompt from '~/components/push/PrePrompt.vue';
import PushSettings from '~/components/push/Settings.vue';

import type { PushOverview, PushStatusView } from '#shared/schemas/push';

const preferences = { newEvents: true, reminders: true, spots: false, changes: true };

function status(overrides: Partial<PushStatusView> = {}): PushStatusView {
  return {
    enabled: true,
    configured: true,
    publicKey: 'key',
    preferences,
    devices: [],
    receivedLast7Days: 0,
    silenceDays: 30,
    ...overrides,
  };
}

function signIn(role: string | null) {
  useState('auth-session').value = { user: { id: 'u1', name: 'Alex', role } };
  useState('auth-session-loaded').value = true;
}

let current = status();
registerEndpoint('/api/push/status', () => current);

describe('notification settings', () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    signIn(null);
    useState('push-permission').value = 'default';
    useState('push-endpoint').value = null;
  });

  it('says the promise in one line, and who can see it', async () => {
    current = status();
    const page = await mountSuspended(PushSettings);
    const text = page.text();
    expect(text).toContain('Only about events. No ads. About 3 a week at most.');
    expect(text).toContain('Admins can see that you turned notifications on.');
  });

  it('shows the four kinds and the devices once a device is on', async () => {
    current = status({
      devices: [
        { id: 1, device: 'Chrome on Linux', createdAt: '2026-10-12T10:00:00.000Z', endpoint: 'e1' },
      ],
      receivedLast7Days: 2,
    });
    const page = await mountSuspended(PushSettings);
    const text = page.text();
    for (const label of ['New events', 'Reminders', 'Waitlist places', 'Changes to my events']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('Chrome on Linux');
    expect(text).toContain('Received in the last 7 days');
  });

  it('explains a blocked browser instead of offering the switch', async () => {
    current = status();
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'denied' });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: () => Promise.resolve(undefined) },
    });
    const page = await mountSuspended(PushSettings);
    expect(page.text()).toContain('Your browser blocks notifications for this site.');
    expect(page.find('button[role="switch"]').attributes('disabled')).toBeDefined();
  });

  it('says so when push is switched off', async () => {
    current = status({ enabled: false });
    const page = await mountSuspended(PushSettings);
    expect(page.text()).toContain('Notifications are switched off for now.');
  });

  it('says so when the server has no keys, instead of blaming an admin', async () => {
    current = status({ configured: false, publicKey: null });
    const page = await mountSuspended(PushSettings);
    const text = page.text();
    expect(text).toContain('Notifications aren’t set up on this server yet.');
    expect(text).not.toContain('switched off');
  });
});

const overview: PushOverview = {
  weeklyCap: 3,
  sentThisWeek: 87,
  mostReceived: 5,
  overCap: 2,
  subscribers: 213,
  accounts: 1480,
  byKind: { newEvent: 12, reminder: 51, spot: 9, cancelled: 6, rescheduled: 9 },
};
registerEndpoint('/api/admin/push/overview', () => overview);
registerEndpoint('/api/admin/push/subscribers', () => ({
  items: [
    {
      userId: 'u2',
      name: 'Camille Martin',
      school: 'Epitech',
      preferences,
      devices: 2,
      since: '2026-10-12T10:00:00.000Z',
      receivedLast7Days: 5,
    },
  ],
}));
registerEndpoint('/api/admin/push/settings', () => ({
  weeklyCap: 3,
  silenceDays: 30,
  quietEnabled: true,
  quietFrom: 22,
  quietUntil: 8,
}));

describe('admin push', () => {
  it('warns about the weekly limit without blocking anything', async () => {
    signIn('admin');
    const page = await mountSuspended(AdminPush);
    const text = page.text();
    expect(text).toContain('87');
    expect(text).toContain('2 people received more than 3 notifications this week.');
    expect(text).toContain('Nothing is blocked.');
    expect(text).toContain('Camille Martin');
    expect(text).toContain('Weekly limit before a warning');
    expect(text).toContain('Hold announcements at night');
  });

  it('gives events managers the counts only', async () => {
    signIn('events-manager');
    const page = await mountSuspended(AdminPush);
    const text = page.text();
    expect(text).toContain('87');
    expect(text).not.toContain('Camille Martin');
    expect(text).toContain('Events managers see the counts and the confirmations');
  });
});

function stubScreen(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop && query.includes('min-width'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('notification prompt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('is a dialog with right-aligned buttons on desktop', async () => {
    stubScreen(true);
    await mountSuspended(PushPrePrompt, { props: { open: true }, attachTo: document.body });
    await nextTick();
    const text = document.body.textContent;
    expect(text).toContain('Stay in the loop on your events');
    expect(text).toContain('Notify me');
    expect(document.body.querySelector('[data-vaul-drawer]')).toBeNull();
  });

  it('is a bottom sheet on phones', async () => {
    stubScreen(false);
    await mountSuspended(PushPrePrompt, { props: { open: true }, attachTo: document.body });
    await nextTick();
    expect(document.body.textContent).toContain('Notify me');
    expect(document.body.querySelector('[data-vaul-drawer]')).not.toBeNull();
  });
});

/** usePush needs a component around it, for the i18n it reads. */
async function pushInComponent() {
  let push!: ReturnType<typeof usePush>;
  await mountSuspended(
    defineComponent({
      setup() {
        push = usePush();
        return () => null;
      },
    }),
  );
  return push;
}

describe('asking again', () => {
  afterEach(() => vi.unstubAllGlobals());

  function browser(permission: NotificationPermission, subscribed: boolean) {
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: () =>
          Promise.resolve({
            pushManager: {
              getSubscription: () => Promise.resolve(subscribed ? { endpoint: 'e1' } : null),
            },
          }),
      },
    });
  }

  beforeEach(() => {
    signIn(null);
    current = status();
    try {
      localStorage.removeItem('lnb_push_snooze');
    } catch {
      // Nothing stored.
    }
  });

  it('asks again after notifications were switched off here, since the permission stays granted', async () => {
    browser('granted', false);
    expect(await (await pushInComponent()).shouldAsk()).toBe(true);
  });

  it('asks a browser that was never asked', async () => {
    browser('default', false);
    expect(await (await pushInComponent()).shouldAsk()).toBe(true);
  });

  it('does not ask a blocked browser, which could not answer', async () => {
    browser('denied', false);
    expect(await (await pushInComponent()).shouldAsk()).toBe(false);
  });

  it('does not ask after "Not now", until the silence is over', async () => {
    browser('granted', false);
    const push = await pushInComponent();
    await push.refresh();
    push.snooze();
    expect(await push.shouldAsk()).toBe(false);
  });

  it('does not ask a browser that already has notifications on', async () => {
    browser('granted', true);
    current = status({
      devices: [
        {
          id: 1,
          device: 'Firefox on Linux',
          createdAt: '2026-10-12T10:00:00.000Z',
          endpoint: 'e1',
        },
      ],
    });
    expect(await (await pushInComponent()).shouldAsk()).toBe(false);
  });
});
