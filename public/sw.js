/* Service worker — só Web Push (sem cache offline, pra não conflitar com o SWR do app).
   Recebe o push, mostra a notificação e abre a permalink do post ao clicar. */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} }
  catch { d = { body: event.data && event.data.text() } }
  const title = d.title || 'x Network'
  const options = {
    body: d.body || '',
    icon: d.icon || '/favicon.svg',
    badge: d.badge || '/favicon.svg',
    tag: d.tag || undefined,        // agrupa/atualiza pela id do post
    renotify: !!d.tag,
    data: { url: d.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of wins) {
      // reaproveita uma aba já aberta no mesmo site
      try {
        if (new URL(c.url).origin === new URL(url, self.location.origin).origin && 'focus' in c) {
          await c.focus()
          if ('navigate' in c) { try { await c.navigate(url) } catch {} }
          return
        }
      } catch {}
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})

// quando o navegador rotaciona a subscription, re-inscreve e re-registra no backend
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const key = event.oldSubscription
        && event.oldSubscription.options
        && event.oldSubscription.options.applicationServerKey
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
    } catch {}
  })())
})
