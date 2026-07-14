self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" ? payload.title : "OMLU update";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "Your table has an update.",
    tag: typeof payload.tag === "string" ? payload.tag : "omlu-session-update",
    data: {
      url: typeof payload.url === "string" ? payload.url : "/",
    },
    badge: "/window.svg",
    icon: "/window.svg",
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : "/";

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if ("focus" in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(url);
    }
  })());
});
