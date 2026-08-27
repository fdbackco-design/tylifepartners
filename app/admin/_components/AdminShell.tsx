"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CrmSwitch } from "@/app/admin/_components/crm/ui";
import PushSubscribeButton from "@/app/admin/_components/PushSubscribeButton";
import { canAccessAdminPath, defaultAdminHome } from "@/lib/crm/scope";
import { parseOpenCommentFromUrl, peekPendingOpenComment, resolveAppUrl, stashPendingOpenComment } from "@/lib/crm/pushDeepLink";
import type { SessionUser } from "@/lib/crm/types";

const PRIMARY_TABS = [
  { href: "/admin/dashboard", label: "대시보드", ranks: ["admin"] as const },
  { href: "/admin/consumers", label: "소비자 DB", ranks: ["admin", "manager", "sales"] as const },
  { href: "/admin/candidates", label: "후보자 DB", ranks: ["admin", "manager", "sales"] as const },
  { href: "/admin/reassign", label: "담당자 변경 필요", ranks: ["admin", "manager"] as const },
  { href: "/admin/calendar", label: "캘린더", ranks: ["admin", "manager", "sales"] as const },
];

const SECONDARY_TABS = [
  { href: "/admin/password", label: "비밀번호 변경", ranks: ["admin", "manager", "sales"] as const },
  { href: "/admin/accounts", label: "계정 관리", ranks: ["admin", "manager"] as const },
  { href: "/admin/audit-logs", label: "활동 로그", ranks: ["admin"] as const },
  { href: "/admin/assignment", label: "자동 분배 설정", ranks: ["admin"] as const },
  { href: "/admin/blacklist", label: "블랙리스트", ranks: ["admin"] as const },
  { href: "/admin/utm", label: "UTM", ranks: ["admin"] as const },
  { href: "/admin/landings", label: "랜딩", ranks: ["admin"] as const },
  { href: "/admin/landing-analytics", label: "스크롤 히트맵", ranks: ["admin"] as const },
];

function isActiveTab(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [autoAssign, setAutoAssign] = useState(true);
  const [autoAssignSaving, setAutoAssignSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          router.replace("/admin");
          return;
        }
        setUser(d.user);
      })
      .catch(() => router.replace("/admin"));
  }, [router]);

  useEffect(() => {
    if (user?.rank !== "admin") return;
    fetch("/api/admin/assignment")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setAutoAssign(d.auto_assign_enabled !== false);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!canAccessAdminPath(user.rank, pathname)) {
      router.replace(defaultAdminHome(user.rank));
    }
  }, [user, pathname, router]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const openFromNotificationUrl = (rawUrl: string) => {
      const leadId = parseOpenCommentFromUrl(rawUrl);
      if (leadId) stashPendingOpenComment(leadId);

      const nextUrl = resolveAppUrl(rawUrl);
      let currentPath = "";
      let nextPath = "";
      try {
        currentPath = `${window.location.pathname}${window.location.search}`;
        nextPath = `${new URL(nextUrl).pathname}${new URL(nextUrl).search}`;
      } catch {
        currentPath = window.location.href;
        nextPath = nextUrl;
      }

      if (currentPath === nextPath) {
        window.dispatchEvent(
          new CustomEvent("crm-open-comment-deeplink", {
            detail: { leadId: leadId ?? undefined, force: true },
          })
        );
        return;
      }
      window.location.assign(nextUrl);
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== "crm-notification-open" || typeof data.url !== "string") return;
      openFromNotificationUrl(data.url);
    };

    // 백그라운드→포그라운드 복귀 시 URL/세션에 남은 딥링크 처리
    const onResume = () => {
      if (document.visibilityState === "hidden") return;
      const fromUrl = new URLSearchParams(window.location.search).get("open_comment");
      const fromStore = peekPendingOpenComment();
      const leadId = fromUrl || fromStore;
      if (!leadId) return;
      window.dispatchEvent(
        new CustomEvent("crm-open-comment-deeplink", {
          detail: { leadId, force: true },
        })
      );
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
    };
  }, []);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin");
  };

  const setAutoAssignEnabled = async (enabled: boolean) => {
    if (autoAssignSaving || enabled === autoAssign) return;
    const prev = autoAssign;
    setAutoAssign(enabled);
    setAutoAssignSaving(true);
    try {
      const res = await fetch("/api/admin/assignment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_assign_enabled: enabled }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAutoAssign(prev);
        alert(data.message || "설정 저장에 실패했습니다.");
      }
    } catch {
      setAutoAssign(prev);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setAutoAssignSaving(false);
    }
  };

  const primaryTabs = useMemo(
    () => (user ? PRIMARY_TABS.filter((t) => (t.ranks as readonly string[]).includes(user.rank)) : []),
    [user]
  );
  const secondaryTabs = useMemo(
    () => (user ? SECONDARY_TABS.filter((t) => (t.ranks as readonly string[]).includes(user.rank)) : []),
    [user]
  );

  if (!user) {
    return (
      <div className="crm-app">
        <div style={{ padding: 48, textAlign: "center", color: "var(--crm-muted)" }}>로딩 중...</div>
      </div>
    );
  }

  if (!canAccessAdminPath(user.rank, pathname)) {
    return (
      <div className="crm-app">
        <div style={{ padding: 48, textAlign: "center", color: "var(--crm-muted)" }}>이동 중...</div>
      </div>
    );
  }

  const rankLabel = user.rank === "admin" ? "관리자" : user.rank === "manager" ? "매니저" : "영업자";
  const home = defaultAdminHome(user.rank);

  return (
    <div className="crm-app">
      <header className="crm-header">
        <div className="crm-header-bar">
          <Link href={home} className="crm-brand">
            <img className="crm-brand-mark" src="/icon.png" alt="" width={28} height={28} />
            <span className="crm-brand-text">
              <span className="crm-brand-full">FEED LIFE 상담관리</span>
              <span className="crm-brand-short">FEED LIFE</span>
            </span>
          </Link>
          <div className="crm-header-meta">
            {user.rank === "admin" && (
              <div className="crm-auto-assign">
                <CrmSwitch
                  checked={autoAssign}
                  disabled={autoAssignSaving}
                  onChange={(v) => void setAutoAssignEnabled(v)}
                  label="자동 분배로직"
                />
              </div>
            )}
            <span>
              {user.name} · {rankLabel}
            </span>
            <div className="crm-header-actions">
              <PushSubscribeButton />
              <button type="button" className="crm-btn" onClick={logout}>
                로그아웃
              </button>
            </div>
          </div>
        </div>
        <nav className="crm-tabs" aria-label="주요 메뉴">
          {primaryTabs.map((t) => (
            <Link key={t.href} href={t.href} className={`crm-tab${isActiveTab(pathname, t.href) ? " active" : ""}`}>
              {t.label}
            </Link>
          ))}
          {secondaryTabs.length > 0 && (
            <>
              <span className="crm-tab-divider" aria-hidden />
              {secondaryTabs.map((t) => (
                <Link key={t.href} href={t.href} className={`crm-tab${isActiveTab(pathname, t.href) ? " active" : ""}`}>
                  {t.label}
                </Link>
              ))}
            </>
          )}
        </nav>
      </header>
      <div className="crm-main">{children}</div>
    </div>
  );
}
