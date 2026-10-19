import type { PushPreferences, PushStatusView } from '#shared/schemas/push';

// Notifications about events, on this browser. The server holds the devices and the four
// switches; the browser holds the permission, the subscription and the "Not now" mark.
// See docs/push.md.

const SNOOZE_KEY = 'lnb_push_snooze';

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const raw = atob(padded.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushPermission = NotificationPermission | 'unsupported';

export function usePush() {
  const { locale } = useI18n();
  const { user } = useAuth();
  const { isEnabled } = useFlags();

  const status = useState<PushStatusView | null>('push-status', () => null);
  const permission = useState<PushPermission>('push-permission', () => 'default');
  // The endpoint of this browser's subscription, if it has one.
  const endpoint = useState<string | null>('push-endpoint', () => null);
  const pending = useState('push-pending', () => false);
  // Forwards the visitor's cookies when this runs during server rendering.
  const requestFetch = useRequestFetch();

  const available = computed(() => isEnabled('push') && !!status.value?.configured);
  const canSubscribe = computed(() => available.value && isEnabled('push.subscribe'));

  /** Whether this browser can receive web push at all. */
  function supported(): boolean {
    return (
      import.meta.client &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  /** iPhone and iPad only allow web push once the site is on the home screen. */
  function needsHomeScreen(): boolean {
    if (!import.meta.client) return false;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone;
  }

  async function registration() {
    return navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }

  /** Reads the server's view and this browser's permission and subscription. */
  async function refresh() {
    if (!user.value) return;
    try {
      status.value = await requestFetch<PushStatusView>('/api/push/status');
    } catch (error) {
      console.error('Unable to load the notification settings', error);
    }
    // What the browser says can only be read in the browser.
    if (!import.meta.client) return;
    if (!supported()) {
      permission.value = 'unsupported';
      return;
    }
    permission.value = Notification.permission;
    try {
      const subscription = await (
        await navigator.serviceWorker.getRegistration('/')
      )?.pushManager.getSubscription();
      endpoint.value = subscription?.endpoint ?? null;
    } catch {
      endpoint.value = null;
    }
  }

  /** This browser has notifications on: permission granted, a subscription, and a device saved. */
  const enabledHere = computed(
    () =>
      endpoint.value !== null &&
      !!status.value?.devices.some((device) => device.endpoint === endpoint.value),
  );

  /** Asks the browser, subscribes, and saves the device. Throws if the person said no. */
  async function enable() {
    if (!supported() || !status.value?.publicKey) throw new Error('unsupported');
    pending.value = true;
    try {
      const result = await Notification.requestPermission();
      permission.value = result;
      if (result !== 'granted') throw new Error('denied');
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(status.value.publicKey),
        }));
      const json = subscription.toJSON();
      await $fetch('/api/push/subscription', {
        method: 'POST',
        body: {
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          locale: locale.value,
        },
      });
      clearSnooze();
      await refresh();
    } finally {
      pending.value = false;
    }
  }

  /** Turns notifications off on this browser. */
  async function disable() {
    pending.value = true;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const subscription = await reg?.pushManager.getSubscription();
      if (subscription) {
        await $fetch('/api/push/subscription', {
          method: 'DELETE',
          body: { endpoint: subscription.endpoint },
        });
        await subscription.unsubscribe();
      }
      await refresh();
    } finally {
      pending.value = false;
    }
  }

  async function removeDevice(id: number) {
    await $fetch(`/api/push/devices/${String(id)}`, { method: 'DELETE' });
    await refresh();
  }

  async function setPreference(key: keyof PushPreferences, value: boolean) {
    const preferences = await $fetch<PushPreferences>('/api/push/preferences', {
      method: 'PATCH',
      body: { [key]: value },
    });
    if (status.value) status.value = { ...status.value, preferences };
  }

  /** Keeps this device's notification language in step with the account page. */
  async function syncLocale() {
    if (!enabledHere.value || !endpoint.value) return;
    await $fetch('/api/push/subscription', {
      method: 'PATCH',
      body: { endpoint: endpoint.value, locale: locale.value },
    });
  }

  // "Not now": quiet on this device for as long as the admin chose.
  function clearSnooze() {
    try {
      localStorage.removeItem(SNOOZE_KEY);
    } catch {
      // Private mode: the prompt just may come back sooner.
    }
  }

  function snooze() {
    const days = status.value?.silenceDays ?? null;
    try {
      localStorage.setItem(
        SNOOZE_KEY,
        days === null ? 'never' : String(Date.now() + days * 24 * 60 * 60 * 1000),
      );
    } catch {
      // Private mode: the prompt just may come back sooner.
    }
  }

  function snoozed(): boolean {
    try {
      const value = localStorage.getItem(SNOOZE_KEY);
      if (!value) return false;
      return value === 'never' || Number(value) > Date.now();
    } catch {
      return false;
    }
  }

  /** Whether to offer notifications now, such as right after a registration. */
  async function shouldAsk(): Promise<boolean> {
    if (!import.meta.client || !user.value) return false;
    await refresh();
    return (
      canSubscribe.value &&
      supported() &&
      !needsHomeScreen() &&
      permission.value === 'default' &&
      !enabledHere.value &&
      !snoozed()
    );
  }

  return {
    status,
    permission,
    endpoint,
    pending,
    available,
    canSubscribe,
    enabledHere,
    supported,
    needsHomeScreen,
    refresh,
    enable,
    disable,
    removeDevice,
    setPreference,
    syncLocale,
    snooze,
    shouldAsk,
  };
}
