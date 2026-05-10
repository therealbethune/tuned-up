/* Tuned Up service worker — handles incoming web pushes and click-throughs. */

self.addEventListener("install", () => {
  // Activate immediately on install.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Tuned Up", body: event.data.text() };
  }

  const title = data.title || "Tuned Up";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon",
    badge: data.badge || "/icon",
    tag: data.tag || undefined,
    data: { url: data.url || "/feed" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is already on the app.
      for (const client of clientList) {
        try {
          const u = new URL(client.url);
          if (u.origin === self.location.origin) {
            return client.focus().then(() => client.navigate(url));
          }
        } catch {}
      }
      return self.clients.openWindow(url);
    }),
  );
});
