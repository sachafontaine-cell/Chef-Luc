// Tapping a "timer finished" notification brings Chef Luc back to the front.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus()
    return self.clients.openWindow(self.registration.scope + '#/cook')
  }))
})
