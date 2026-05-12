/* Tuned Up service worker — handles incoming web pushes and click-throughs. */

self.addEventListener("install", (event) => {
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
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientList) => {
        // Focus an existing tab if one is already on the app. Both
        // focus() and navigate() can reject on some browsers
        // (background-throttled tab, cross-origin frame, missing
        // navigate() on older Safari). Treat any failure as "no
        // usable existing tab" and fall through to openWindow so the
        // notification click never silently drops the user on the
        // floor — that was the previous bug: when focus() threw the
        // outer .then() rejected and event.waitUntil resolved with
        // no window action.
        for (const client of clientList) {
          try {
            const u = new URL(client.url);
            if (u.origin !== self.location.origin) continue;
            try {
              await client.focus();
              if (typeof client.navigate === "function") {
                await client.navigate(url);
              }
              return;
            } catch {
              /* try next client */
            }
          } catch {
            /* malformed client url */
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
