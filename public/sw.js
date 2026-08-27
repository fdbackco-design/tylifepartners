/* global self, clients */
/* FEED LIFE CRM Web Push Service Worker */
/* sw-version: 2026-08-27-calendar-deeplink */

function resolveNotificationUrl(raw) {
  try {
    return new URL(raw, self.location.origin).href;
  } catch {
    const path = raw && raw.startsWith("/") ? raw : `/${raw || "admin/consumers"}`;
    return `${self.location.origin}${path}`;
  }
}

function parsePushPayload(event) {
  const fallback = {
    title: "FEED LIFE 상담관리",
    body: "새 알림이 있습니다.",
    url: `${self.location.origin}/admin/consumers`,
    tag: "tylife-crm",
  };
  if (!event.data) return fallback;
  try {
    const parsed = event.data.json();
    if (parsed && Number(parsed.web_push) === 8030 && parsed.notification) {
      const n = parsed.notification;
      return {
        title: n.title || fallback.title,
        body: n.body || fallback.body,
        url: resolveNotificationUrl(n.navigate || parsed.url || fallback.url),
        tag: n.tag || parsed.tag || fallback.tag,
      };
    }
    return {
      title: parsed.title || fallback.title,
      body: parsed.body || fallback.body,
      url: resolveNotificationUrl(parsed.url || parsed.navigate || fallback.url),
      tag: parsed.tag || fallback.tag,
    };
  } catch {
    try {
      const text = event.data.text();
      if (text) return { ...fallback, body: text };
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  const data = parsePushPayload(event);

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.png",
      badge: "/icon.png",
      tag: data.tag,
      data: { url: data.url },
      // Declarative / iOS: 알림 탭 시 이 URL로 이동
      navigate: data.url,
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = resolveNotificationUrl(
    (event.notification.data && event.notification.data.url) ||
      event.notification.navigate ||
      "/admin/consumers"
  );

  event.waitUntil(
    (async () => {
      const clientList = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        const href = client.url || "";
        if (!href.includes(self.location.origin)) continue;

        try {
          client.postMessage({ type: "crm-notification-open", url: targetUrl });
        } catch {
          /* ignore */
        }

        try {
          if (typeof client.focus === "function") await client.focus();
        } catch {
          /* ignore */
        }

        if (typeof client.navigate === "function") {
          try {
            await client.navigate(targetUrl);
            return;
          } catch {
            /* iOS 등 navigate 미지원 */
          }
        }
      }

      // 백그라운드 iOS 웹앱: focus만 하면 URL이 안 바뀜 → openWindow로 딥링크 강제
      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })()
  );
});
