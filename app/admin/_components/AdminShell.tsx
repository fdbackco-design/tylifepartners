"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CrmSwitch } from "@/app/admin/_components/crm/ui";
import { canAccessAdminPath, defaultAdminHome } from "@/lib/crm/scope";
import type { SessionUser } from "@/lib/crm/types";

const PRIMARY_TABS = [
  { href: "/admin/dashboard", label: "대시보드", ranks: ["admin"] as const },
  { href: "/admin/consumers", label: "소비자 DB", ranks: ["admin", "manager", "sales"] as const },
  { href: "/admin/candidates", label: "후보자 DB", ranks: ["admin", "manager", "sales"] as const },
  { href: "/admin/reassign", label: "담당자 변경 필요", ranks: ["admin", "manager"] as const },
  { href: "/admin/calendar", label: "캘린더", ranks: ["admin", "manager", "sales"] as const },
];

const SECONDARY_TABS = [
  { href: "/admin/accounts", label: "계정 관리", ranks: ["admin", "manager"] as const },
  { href: "/admin/assignment", label: "자동 분배 설정", ranks: ["admin"] as const },
  { href: "/admin/merge", label: "중복 병합", ranks: ["admin"] as const },
  { href: "/admin/excel-import", label: "엑셀 이관", ranks: ["admin"] as const },
  { href: "/admin/utm", label: "UTM", ranks: ["admin"] as const },
  { href: "/admin/landings", label: "랜딩", ranks: ["admin"] as const },
];

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
            <button type="button" className="crm-btn" onClick={logout}>
              로그아웃
            </button>
          </div>
        </div>
        <nav className="crm-tabs" aria-label="주요 메뉴">
          {primaryTabs.map((t) => (
            <Link key={t.href} href={t.href} className={`crm-tab${pathname.startsWith(t.href) ? " active" : ""}`}>
              {t.label}
            </Link>
          ))}
          {secondaryTabs.length > 0 && (
            <>
              <span className="crm-tab-divider" aria-hidden />
              {secondaryTabs.map((t) => (
                <Link key={t.href} href={t.href} className={`crm-tab${pathname.startsWith(t.href) ? " active" : ""}`}>
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
