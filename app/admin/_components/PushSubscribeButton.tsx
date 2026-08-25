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
      const vapidRes = await fetch("/api/admin/push/vapid-public");
      const vapid = await vapidRes.json();
      if (!vapid.ok || !vapid.configured || !vapid.publicKey) {
        setStatus("unconfigured");
        return;
      }

      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
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
      const vapidRes = await fetch("/api/admin/push/vapid-public");
      const vapid = await vapidRes.json();
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
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
        });
      }

      const res = await fetch("/api/admin/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.message || "알림 구독에 실패했습니다.");
        return;
      }
      setStatus("on");
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
        await fetch("/api/admin/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
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

  if (status === "loading" || status === "unsupported" || status === "unconfigured") {
    return null;
  }

  if (status === "on") {
    return (
      <button type="button" className="crm-btn" disabled={busy} onClick={() => void disable()} title="웹 푸시 알림 끄기">
        알림 ON
      </button>
    );
  }

  return (
    <button
      type="button"
      className="crm-btn crm-btn-primary"
      disabled={busy}
      onClick={() => void enable()}
      title="신규 DB·배정 알림 받기"
    >
      {busy ? "설정 중…" : "알림 켜기"}
    </button>
  );
}
