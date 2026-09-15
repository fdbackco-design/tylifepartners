/** 브라우저 Web Push 구독/동기화 (관리자 CRM) */

export type WebPushClientStatus =
  | "unsupported"
  | "unconfigured"
  | "need_permission"
  | "off"
  | "on";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  void reg.update();
  return reg;
}

async function saveSubscription(sub: PushSubscription): Promise<{ ok: boolean; message?: string; status?: number }> {
  const { res, data } = await fetchJson("/api/admin/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  return { ok: Boolean(data.ok), message: data.message, status: res.status };
}

/**
 * 알림 권한이 이미 허용된 경우 SW 등록 + Push 구독을 서버에 동기화.
 * Windows/Mac 데스크톱에서 OS 알림이 오려면 세션마다 구독 동기화가 필요합니다.
 */
export async function ensureWebPushSubscription(opts?: {
  /** true면 permission이 default일 때 requestPermission 호출 */
  requestIfNeeded?: boolean;
}): Promise<{ status: WebPushClientStatus; message?: string }> {
  if (!isPushSupported()) return { status: "unsupported" };

  const { res: vapidRes, data: vapid } = await fetchJson("/api/admin/push/vapid-public");
  if (vapidRes.status === 401) {
    return { status: Notification.permission === "granted" ? "on" : "need_permission" };
  }
  if (!vapid.ok || !vapid.configured || !vapid.publicKey) {
    return { status: "unconfigured", message: vapid.message };
  }

  let permission = Notification.permission;
  if (permission === "denied") return { status: "off" };

  if (permission === "default") {
    if (!opts?.requestIfNeeded) return { status: "need_permission" };
    permission = await Notification.requestPermission();
    if (permission !== "granted") return { status: permission === "denied" ? "off" : "need_permission" };
  }

  const reg = await registerServiceWorker();
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
    });
  }

  const saved = await saveSubscription(sub);
  if (saved.status === 401) {
    return { status: "need_permission", message: "로그인이 만료되었습니다." };
  }
  if (!saved.ok) {
    return { status: "need_permission", message: saved.message || "구독 저장에 실패했습니다." };
  }

  return { status: "on" };
}

export async function disableWebPushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetchJson("/api/admin/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

export async function showLocalPushConfirmation(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const origin = window.location.origin;
    await registration.showNotification("FEED LIFE CRM", {
      body: "알림이 켜졌습니다. 코멘트·신규 DB·배정 시 Windows/Mac에서도 알림이 표시됩니다.",
      icon: `${origin}/assets/crm-app-icon.png`,
      badge: `${origin}/assets/crm-app-icon.png`,
      tag: "tylife-crm-push-on",
      data: { url: `${origin}/admin/consumers` },
    });
  } catch {
    /* 구독은 성공한 상태로 유지 */
  }
}
