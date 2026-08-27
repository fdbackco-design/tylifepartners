/* global self, clients */
/* FEED LIFE CRM Web Push Service Worker */

function resolveNotificationUrl(raw) {
  try {
    return new URL(raw, self.location.origin).href;
  } catch {
    const path = raw && raw.startsWith("/") ? raw : `/${raw || "admin/consumers"}`;
    return `${self.location.origin}${path}`;
  }
}

self.addEventListener("push", (event) => {
  let data = {
    title: "FEED LIFE 상담관리",
    body: "새 알림이 있습니다.",
    url: "/admin/consumers",
    tag: "tylife-crm",
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.png",
      badge: "/icon.png",
      tag: data.tag,
      data: { url: data.url },
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = resolveNotificationUrl(
    (event.notification.data && event.notification.data.url) || "/admin/consumers"
  );

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const href = client.url || "";
        if (!href.includes("/admin")) continue;

        // iOS 홈 화면 웹앱은 client.navigate() 미지원 → 페이지에 메시지 전달
        client.postMessage({ type: "crm-notification-open", url: targetUrl });

        if ("navigate" in client && typeof client.navigate === "function") {
          try {
            return client.navigate(targetUrl).then(() => ("focus" in client ? client.focus() : undefined));
          } catch {
            /* postMessage + focus fallback */
          }
        }
        if ("focus" in client) return client.focus();
        return;
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
