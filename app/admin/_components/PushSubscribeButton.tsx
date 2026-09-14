"use client";

import { useCallback, useEffect, useState } from "react";
import {
  disableWebPushSubscription,
  ensureWebPushSubscription,
  showLocalPushConfirmation,
  type WebPushClientStatus,
} from "@/lib/crm/webPushClient";

type Status = "loading" | WebPushClientStatus;

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

export default function PushSubscribeButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await ensureWebPushSubscription();
      setStatus(result.status);
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
      const result = await ensureWebPushSubscription({ requestIfNeeded: true });
      if (result.status === "unconfigured") {
        alert(result.message || "웹 푸시가 설정되지 않았습니다.");
        setStatus("unconfigured");
        return;
      }
      if (result.message?.includes("로그인")) {
        alert("로그인이 만료되었습니다. 다시 로그인한 뒤 알림을 켜 주세요.");
        return;
      }
      if (result.status === "on") {
        setStatus("on");
        await showLocalPushConfirmation();
        return;
      }
      if (result.status === "off") {
        setStatus("off");
        return;
      }
      if (result.message) {
        alert(result.message);
      }
      setStatus(result.status);
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
      await disableWebPushSubscription();
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
      title={status === "off" ? "브라우저에서 알림이 차단되었습니다" : "신규 DB·배정·코멘트 알림 받기"}
      aria-label="알림 켜기"
      aria-pressed="false"
    >
      <BellIcon />
    </button>
  );
}
