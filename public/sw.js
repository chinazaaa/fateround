/* Minimal service worker — web push only (no offline caching).
 * Handles incoming push messages and clicks. Payload shape is set by
 * src/lib/push.ts: { title, body, event, gameCode, url }. */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    if (event.data) data = event.data.json()
  } catch {
    // Malformed payload — fall back to the empty default above.
  }

  const title = data.title || 'Fateround'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Coalesce repeats of the same event for a game into one notification.
    tag: data.event && data.gameCode ? `${data.gameCode}-${data.event}` : undefined,
    renotify: true,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      // Prefer a tab that's already on the target URL — just focus it.
      for (const client of clientList) {
        try {
          const clientPath = new URL(client.url).pathname
          if (clientPath === targetUrl && 'focus' in client) return client.focus()
        } catch {
          // Fall through to the substring check for exotic URLs.
        }
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      // Otherwise reuse the first same-origin PWA window: navigate it to the
      // target and focus it. Without this the click was a no-op on installed
      // PWAs on iOS/Android where openWindow can be blocked when a same-origin
      // client is already registered.
      for (const client of clientList) {
        if ('navigate' in client && 'focus' in client) {
          try {
            await client.navigate(targetUrl)
            return client.focus()
          } catch {
            // navigate() can reject on cross-origin transitions or older
            // browsers; fall through to openWindow.
          }
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
