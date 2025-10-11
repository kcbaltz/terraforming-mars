/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// Handle push events from the server
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const title = data.title || 'Terraforming Mars';
  const options: NotificationOptions = {
    body: data.body || 'It\'s your turn!',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'tm-turn-notification',
    requireInteraction: false,
    data: {
      url: data.url || '/',
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options),
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({type: 'window', includeUncontrolled: true})
      .then((clientList): Promise<void> => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus().then(() => undefined);
          }
        }
        // Otherwise open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen).then(() => undefined);
        }
        return Promise.resolve();
      }),
  );
});

export {};
