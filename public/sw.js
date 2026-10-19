// The service worker behind push notifications: shows what the server sends and opens the event
// page on tap. It caches nothing. See docs/push.md.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A payload we can't read still has to show something: browsers require a visible notification.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'LNB', {
      body: data.body || '',
      tag: data.tag,
      // PNGs of the LNB logo: notifications can't use the SVG.
      icon: '/notification-icon.png',
      badge: '/notification-badge.png',
      data: { url: data.url || '/events' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/events', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.navigate(url).then((c) => (c ?? client).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
