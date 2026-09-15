"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/crm/types";

export type CrmCheckupItem = {
  key: string;
  label: string;
  count: number;
  href: string;
};

const STORAGE_PREFIX = "crm-checkup-v1";
const ACTION_THRESHOLD = 5;
const WORK_MINUTES_THRESHOLD = 45;
const COOLDOWN_MINUTES = 30;
const EVENT_OPEN = "crm-checkup-open";
const EVENT_SUMMARY = "crm-checkup-summary";

type SummaryDetail = { items: CrmCheckupItem[]; total: number };

function storageKey(userId: string | null, loginId: string, suffix: string) {
  return `${STORAGE_PREFIX}:${userId || loginId}:${suffix}`;
}

function readNumber(key: string, fallback = 0): number {
  try {
    const n = Number(sessionStorage.getItem(key));
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, value: number) {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

function readIso(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeIso(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function isCooldownActive(lastShownIso: string | null): boolean {
  if (!lastShownIso) return false;
  const t = Date.parse(lastShownIso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < COOLDOWN_MINUTES * 60 * 1000;
}

function isCrmWorkMutation(url: string, method: string): boolean {
  if (method !== "PATCH" && method !== "POST") return false;
  return (
    /\/api\/admin\/leads\/[^/?]+(?:\?|$)/.test(url) ||
    /\/api\/admin\/tm001\/[^/?]+(?:\?|$)/.test(url) ||
    /\/api\/admin\/tm001\/bulk-assign/.test(url) ||
    /\/api\/admin\/leads\/[^/?]+\/notify-comment/.test(url)
  );
}

function publishSummary(items: CrmCheckupItem[]) {
  const total = items.reduce((n, i) => n + i.count, 0);
  window.dispatchEvent(
    new CustomEvent<SummaryDetail>(EVENT_SUMMARY, { detail: { items, total } })
  );
}

const MASCOT_ATTENTION = "/assets/deunbi-checkup-attention.webp";
const MASCOT_COMPLETE = "/assets/deunbi-checkup-complete.webp";

/** 검색창 옆 든비 안내 — 확인 필요 / 완료 상태 모두 표시 */
export function CrmCheckupToolbarBanner({ enabled }: { enabled: boolean }) {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [celebrateTick, setCelebrateTick] = useState(0);
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const onSummary = (e: Event) => {
      const detail = (e as CustomEvent<SummaryDetail>).detail;
      const next = Math.max(0, Number(detail?.total) || 0);
      setPendingCount(next);
    };
    window.addEventListener(EVENT_SUMMARY, onSummary as EventListener);
    return () => window.removeEventListener(EVENT_SUMMARY, onSummary as EventListener);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/crm-checkup", { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !data.ok) return;
        const items = Array.isArray(data.items) ? (data.items as CrmCheckupItem[]) : [];
        publishSummary(items);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (pendingCount === null) return;
    const prev = prevCountRef.current;
    const isComplete = pendingCount === 0;
    // 첫 진입(0건) 또는 1건↑ → 0건 전환 시에만 축하 애니메이션 재생
    if (isComplete && (prev === null || prev > 0)) {
      setCelebrateTick((n) => n + 1);
    }
    prevCountRef.current = pendingCount;
  }, [pendingCount]);

  if (!enabled || pendingCount === null) return null;

  const isComplete = pendingCount === 0;
  const bannerState = isComplete ? "complete" : "pending";
  const title = isComplete ? "후속 점검 완료 내역 보기" : "확인이 필요한 후속 업무 보기";
  const ariaLabel = isComplete
    ? "CRM 후속 점검 완료, 확인이 필요한 업무 없음"
    : `CRM 후속 점검, 확인이 필요한 업무 ${pendingCount}건 보기`;

  return (
    <button
      type="button"
      className="crm-checkup-toolbar-banner"
      data-state={bannerState}
      onClick={() => window.dispatchEvent(new CustomEvent(EVENT_OPEN))}
      title={title}
      aria-label={ariaLabel}
    >
      <span className="crm-checkup-toolbar-banner__title">CRM 후속 점검</span>
      <span className="crm-checkup-toolbar-banner__text" aria-live="polite">
        {isComplete ? (
          <>
            오늘의 후속 업무를 모두 확인했어요 ·{" "}
            <strong className="crm-checkup-toolbar-banner__count">확인 필요 0건</strong>
          </>
        ) : (
          <>
            잠시 메모·일정을 확인한 뒤 다음 콜을 이어가 주세요 ·{" "}
            <strong className="crm-checkup-toolbar-banner__count">확인 필요 {pendingCount}건</strong>
          </>
        )}
      </span>
      <span
        key={isComplete ? `complete-${celebrateTick}` : "pending"}
        className="crm-checkup-toolbar-banner__mascot-wrap"
        aria-hidden="true"
      >
        <img
          className="crm-checkup-toolbar-banner__mascot"
          src={isComplete ? MASCOT_COMPLETE : MASCOT_ATTENTION}
          alt=""
          width={112}
          height={112}
          draggable={false}
        />
      </span>
    </button>
  );
}

/**
 * 우측 하단 고정 알림 + 콜 활동/시간 기반 자동 노출.
 * 헤더 버튼·모달 대신 화면을 따라다니는 패널로 안내합니다.
 */
export default function CrmCheckupReminder({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CrmCheckupItem[]>([]);
  const busyRef = useRef(false);
  const openRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const keysRef = useRef({
    actions: storageKey(user.userId, user.loginId, "actions"),
    started: storageKey(user.userId, user.loginId, "started"),
    lastShown: storageKey(user.userId, user.loginId, "lastShown"),
  });

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    keysRef.current = {
      actions: storageKey(user.userId, user.loginId, "actions"),
      started: storageKey(user.userId, user.loginId, "started"),
      lastShown: storageKey(user.userId, user.loginId, "lastShown"),
    };
    if (!readIso(keysRef.current.started)) {
      writeIso(keysRef.current.started, new Date().toISOString());
    }
  }, [user.userId, user.loginId]);

  const showPanel = useCallback((nextItems: CrmCheckupItem[], markShown: boolean) => {
    setItems(nextItems);
    setOpen(true);
    publishSummary(nextItems);
    if (markShown) {
      writeIso(keysRef.current.lastShown, new Date().toISOString());
      writeNumber(keysRef.current.actions, 0);
      writeIso(keysRef.current.started, new Date().toISOString());
    }
  }, []);

  /** 배너 건수만 갱신 (패널은 열지 않음). 메모·상태 저장 직후 호출 */
  const refreshSummaryQuiet = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/crm-checkup", { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) return;
      const nextItems = Array.isArray(data.items) ? (data.items as CrmCheckupItem[]) : [];
      publishSummary(nextItems);
      if (openRef.current) setItems(nextItems);
    } catch {
      /* ignore */
    }
  }, []);

  const scheduleSummaryRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void refreshSummaryQuiet();
    }, 450);
  }, [refreshSummaryQuiet]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current != null) window.clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const runCheckup = useCallback(
    async (reason: "actions" | "timer" | "manual") => {
      if (busyRef.current) return;
      if (reason !== "manual" && isCooldownActive(readIso(keysRef.current.lastShown))) return;

      busyRef.current = true;
      try {
        const res = await fetch("/api/admin/crm-checkup", { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) return;
        const nextItems = Array.isArray(data.items) ? (data.items as CrmCheckupItem[]) : [];
        publishSummary(nextItems);
        if (!nextItems.length) {
          if (reason === "actions") writeNumber(keysRef.current.actions, 0);
          if (reason === "manual") showPanel([], false);
          return;
        }
        showPanel(nextItems, reason !== "manual" || !openRef.current);
      } catch {
        /* ignore */
      } finally {
        busyRef.current = false;
      }
    },
    [showPanel]
  );

  const bumpAction = useCallback(() => {
    const key = keysRef.current.actions;
    const next = readNumber(key) + 1;
    writeNumber(key, next);
    scheduleSummaryRefresh();
    if (next >= ACTION_THRESHOLD) void runCheckup("actions");
  }, [runCheckup, scheduleSummaryRefresh]);

  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      try {
        const input = args[0];
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const method = String(args[1]?.method || "GET").toUpperCase();
        if (res.ok && isCrmWorkMutation(url, method)) bumpAction();
      } catch {
        /* ignore */
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, [bumpAction]);

  useEffect(() => {
    const tick = () => {
      const started = readIso(keysRef.current.started);
      if (!started) return;
      const elapsed = Date.now() - Date.parse(started);
      if (Number.isNaN(elapsed)) return;
      if (elapsed >= WORK_MINUTES_THRESHOLD * 60 * 1000) {
        void runCheckup("timer");
      }
    };
    const id = window.setInterval(tick, 60 * 1000);
    const boot = window.setTimeout(tick, 8 * 1000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(boot);
    };
  }, [runCheckup]);

  useEffect(() => {
    const onOpen = () => {
      void runCheckup("manual");
    };
    window.addEventListener(EVENT_OPEN, onOpen);
    return () => window.removeEventListener(EVENT_OPEN, onOpen);
  }, [runCheckup]);

  if (!open) return null;

  const total = items.reduce((n, i) => n + i.count, 0);

  return (
    <aside className="crm-checkup-float" role="dialog" aria-label="CRM 후속 점검" aria-modal="false">
      <div className="crm-checkup-float__head">
        <div>
          <strong>잠시 CRM 후속을 점검해 주세요</strong>
          <p>콜 중 놓친 메모·일정을 짚어 드렸습니다.</p>
        </div>
        <button type="button" className="crm-checkup-float__close" onClick={() => setOpen(false)} aria-label="닫기">
          ×
        </button>
      </div>
      {items.length === 0 ? (
        <p className="crm-checkup-float__empty">지금은 확인이 필요한 후속이 없습니다.</p>
      ) : (
        <>
          <div className="crm-checkup-float__meta">현재 확인이 필요한 업무 · {total}건</div>
          <ul className="crm-checkup-float__list">
            {items.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="crm-checkup-float__link" onClick={() => setOpen(false)}>
                  <span>{item.label}</span>
                  <strong>{item.count}건</strong>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
