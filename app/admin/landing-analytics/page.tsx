"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  LANDING_KEYS,
  LANDING_KEY_LABELS,
} from "@/lib/landing-analytics/sections";
import type { LandingAnalyticsReport } from "@/lib/landing-analytics/aggregate";
import { LandingAnalyticsReportView } from "@/app/admin/landing-analytics/_components/LandingAnalyticsReportView";

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function LandingAnalyticsAdminPage() {
  const searchParams = useSearchParams();
  const initialKey = searchParams.get("landing_key")?.trim() || "landing_0715s";
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [landingKey, setLandingKey] = useState<string>(initialKey);
  const [managedOptions, setManagedOptions] = useState<{ key: string; label: string }[]>([]);
  const [fromDate, setFromDate] = useState(
    () => searchParams.get("from")?.trim() || defaultFromDate()
  );
  const [toDate, setToDate] = useState(() => searchParams.get("to")?.trim() || defaultToDate());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<LandingAnalyticsReport | null>(null);
  const [meta, setMeta] = useState<{ event_count: number; truncated: boolean } | null>(null);

  useEffect(() => {
    const key = searchParams.get("landing_key")?.trim();
    if (key) setLandingKey(key);
    const from = searchParams.get("from")?.trim();
    const to = searchParams.get("to")?.trim();
    if (from) setFromDate(from);
    if (to) setToDate(to);
  }, [searchParams]);

  const checkAuth = useCallback(async () => {
    const res = await fetch("/api/admin/leads?limit=1");
    setLoggedIn(res.ok);
    if (res.ok) {
      try {
        const lr = await fetch("/api/admin/landings");
        const lj = await lr.json();
        if (lr.ok && Array.isArray(lj.items)) {
          setManagedOptions(
            lj.items.map((it: { slug: string; path: string; title: string }) => ({
              key: `managed_${it.slug}`,
              label: `${it.title} (${it.path})`,
            }))
          );
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const from = new Date(`${fromDate}T00:00:00`).toISOString();
      const to = new Date(`${toDate}T23:59:59`).toISOString();
      const res = await fetch(
        `/api/admin/landing-analytics?landing_key=${encodeURIComponent(landingKey)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "조회 실패");
        setReport(null);
        return;
      }
      setReport(data.report);
      setMeta({ event_count: data.event_count, truncated: data.truncated });
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [landingKey, fromDate, toDate]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (loggedIn) loadReport();
  }, [loggedIn, loadReport]);

  if (loggedIn === null) {
    return <main style={{ padding: 24 }}>로딩 중…</main>;
  }

  if (!loggedIn) {
    return (
      <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <p>관리자 로그인이 필요합니다.</p>
        <Link href="/admin">관리자 로그인으로 이동</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: "20px 16px 48px", maxWidth: 960, margin: "0 auto" }}>
      <header style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 22, flex: 1 }}>랜딩 행동 분석</h1>
      </header>

      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 24,
          padding: 16,
          border: "1px solid var(--border)",
          borderRadius: 8,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          랜딩
          <select
            value={landingKey}
            onChange={(e) => setLandingKey(e.target.value)}
            style={{ padding: "8px 10px", minWidth: 180 }}
          >
            {LANDING_KEYS.map((k) => (
              <option key={k} value={k}>
                {LANDING_KEY_LABELS[k]}
              </option>
            ))}
            {managedOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          시작일
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          종료일
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button
          type="button"
          onClick={loadReport}
          disabled={loading}
          style={{
            alignSelf: "flex-end",
            padding: "8px 16px",
            background: "var(--cta-bg)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          {loading ? "조회 중…" : "조회"}
        </button>
      </section>

      {error && <p style={{ color: "#c00" }}>{error}</p>}
      {meta?.truncated && (
        <p style={{ color: "#b45309", fontSize: 13 }}>이벤트가 많아 일부만 집계되었습니다 (상한 50,000건).</p>
      )}
      {meta && (
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          이벤트 {meta.event_count.toLocaleString()}건 · 세션 {report?.total_sessions.toLocaleString() ?? 0}개
        </p>
      )}

      {report && <LandingAnalyticsReportView report={report} />}
    </main>
  );
}
