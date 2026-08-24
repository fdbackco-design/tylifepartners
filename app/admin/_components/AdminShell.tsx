"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/crm/types";

const TABS = [
  { href: "/admin/dashboard", label: "대시보드" },
  { href: "/admin/consumers", label: "소비자 DB" },
  { href: "/admin/candidates", label: "후보자 DB" },
  { href: "/admin/recontact", label: "재컨택 필요" },
  { href: "/admin/calendar", label: "캘린더" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

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

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin");
  };

  if (!user) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>로딩 중...</div>;
  }

  const rankLabel = user.rank === "admin" ? "관리자" : user.rank === "manager" ? "매니저" : "영업자";

  return (
    <div className="crm-app">
      <header className="crm-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px 0" }}>
          <strong>TYLIFE 상담관리</strong>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
            <span>
              {user.name} · {rankLabel}
            </span>
            {(user.rank === "admin" || user.rank === "manager") && (
              <Link href="/admin/accounts" style={{ color: "inherit" }}>
                계정 발급
              </Link>
            )}
            {user.rank === "admin" && (
              <>
                <Link href="/admin/assignment" style={{ color: "inherit" }}>
                  배정 설정
                </Link>
                <Link href="/admin/utm" style={{ color: "inherit" }}>
                  UTM
                </Link>
                <Link href="/admin/landings" style={{ color: "inherit" }}>
                  랜딩
                </Link>
              </>
            )}
            <button type="button" onClick={logout} style={{ border: "1px solid var(--border)", background: "#fff", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
              로그아웃
            </button>
          </div>
        </div>
        <nav className="crm-tabs">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={`crm-tab${pathname.startsWith(t.href) ? " active" : ""}`}>
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
