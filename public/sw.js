// Service Worker do Munago — roda em segundo plano no navegador mesmo com
// o sistema fechado. É isso que faz o alerta de prazo virar uma notificação
// de verdade do Windows, não só um popup enquanto a aba está aberta.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Munago', body: 'Você tem uma notificação.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: data.tag || 'munago-alerta-prazo',
      data: { url: data.url || '/' },
      requireInteraction: false,
    })
  );
});

// Clicar na notificação foca uma aba já aberta do sistema, ou abre uma nova.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
