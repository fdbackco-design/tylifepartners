"use client";

import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = "loading" | "unsupported" | "need_permission" | "on" | "off" | "unconfigured";

function BellIcon({ active }: { active?: boolean }) {
  return (
    <svg
      className="crm-push-bell-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 3a5.5 5.5 0 0 0-5.5 5.5v2.1c0 .7-.22 1.38-.63 1.95L4.7 14.3A1.4 1.4 0 0 0 5.85 16.5h12.3a1.4 1.4 0 0 0 1.15-2.2l-1.17-1.75a3.5 3.5 0 0 1-.63-1.95V8.5A5.5 5.5 0 0 0 12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.18 : 0}
      />
      <path
        d="M9.5 17.5a2.5 2.5 0 0 0 5 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
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

export default function PushSubscribeButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }

    try {
      const { res, data: vapid } = await fetchJson("/api/admin/push/vapid-public");
      if (res.status === 401) {
        // 세션 문제는 구독 시점에 안내. 버튼은 유지.
        setStatus(Notification.permission === "granted" ? "on" : "need_permission");
        return;
      }
      if (!vapid.ok || !vapid.configured || !vapid.publicKey) {
        setStatus("unconfigured");
        return;
      }

      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      void reg.update();
      const sub = await reg.pushManager.getSubscription();

      if (Notification.permission === "denied") {
        setStatus("off");
        return;
      }
      if (Notification.permission === "default" || !sub) {
        setStatus("need_permission");
        return;
      }
      setStatus("on");
    } catch {
      setStatus("unsupported");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { res: vapidRes, data: vapid } = await fetchJson("/api/admin/push/vapid-public");
      if (vapidRes.status === 401) {
        alert("로그인이 만료되었습니다. 다시 로그인한 뒤 알림을 켜 주세요.");
        return;
      }
      if (!vapid.ok || !vapid.publicKey) {
        alert(vapid.message || "웹 푸시가 설정되지 않았습니다.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("off");
        return;
      }

      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      void reg.update();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
        });
      }

      const { res, data } = await fetchJson("/api/admin/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (res.status === 401) {
        alert("로그인이 만료되었습니다. 다시 로그인한 뒤 알림을 켜 주세요.");
        return;
      }
      if (!data.ok) {
        alert(data.message || "알림 구독에 실패했습니다.");
        return;
      }
      setStatus("on");

      // 데스크톱·모바일 모두: 설정 직후 확인 알림 (브라우저/OS 알림 허용 상태 확인용)
      try {
        await reg.showNotification("FEED LIFE 상담관리", {
          body: "알림이 켜졌습니다. 신규 DB·배정 시 이 PC/브라우저로도 알림이 옵니다.",
          icon: "/icon.png",
          badge: "/icon.png",
          tag: "tylife-crm-push-on",
          data: { url: "/admin/consumers" },
        });
      } catch {
        /* 무시 — 구독은 성공 */
      }
    } catch (e) {
      console.error(e);
      alert("알림 설정 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const disable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetchJson("/api/admin/push/subscribe", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("need_permission");
    } catch {
      alert("알림 해제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "unsupported") {
    return null;
  }

  if (status === "unconfigured") {
    return (
      <button
        type="button"
        className="crm-push-bell"
        disabled
        title="웹 푸시 서버 설정이 필요합니다"
        aria-label="알림 미설정"
      >
        <BellIcon />
      </button>
    );
  }

  if (status === "on") {
    return (
      <button
        type="button"
        className="crm-push-bell is-on"
        disabled={busy}
        onClick={() => void disable()}
        title="알림 ON · 누르면 끕니다"
        aria-label="알림 ON, 끄기"
        aria-pressed="true"
      >
        <BellIcon active />
        <span className="crm-push-bell-label">ON</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="crm-push-bell"
      disabled={busy || status === "loading"}
      onClick={() => void enable()}
      title={status === "off" ? "브라우저에서 알림이 차단되었습니다" : "신규 DB·배정 알림 받기"}
      aria-label="알림 켜기"
      aria-pressed="false"
    >
      <BellIcon />
    </button>
  );
}
