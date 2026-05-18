"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LANDING_KEYS,
  LANDING_KEY_LABELS,
  type LandingKey,
} from "@/lib/landing-analytics/sections";
import type { LandingAnalyticsReport } from "@/lib/landing-analytics/aggregate";
import { formatDurationSeconds } from "@/lib/landing-analytics/formatDuration";
import {
  HeatmapHelpText,
  ScrollPercentColorHeatmap,
  SectionColorHeatmap,
} from "@/app/admin/landing-analytics/_components/ColorHeatmap";

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function LandingAnalyticsAdminPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [landingKey, setLandingKey] = useState<LandingKey>("parent_main");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<LandingAnalyticsReport | null>(null);
  const [meta, setMeta] = useState<{ event_count: number; truncated: boolean } | null>(null);

  const checkAuth = useCallback(async () => {
    const res = await fetch("/api/admin/leads?limit=1");
    setLoggedIn(res.ok);
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
        <Link href="/admin" style={{ fontSize: 14 }}>
          ← 리드 관리
        </Link>
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
            onChange={(e) => setLandingKey(e.target.value as LandingKey)}
            style={{ padding: "8px 10px", minWidth: 180 }}
          >
            {LANDING_KEYS.map((k) => (
              <option key={k} value={k}>
                {LANDING_KEY_LABELS[k]}
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

      {report && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 12,
              marginBottom: 28,
            }}
          >
            <StatCard label="방문 세션" value={String(report.total_sessions)} />
            <StatCard
              label="평균 체류"
              value={`${Math.round(report.avg_duration_seconds)}초`}
            />
            <StatCard
              label="평균 최대 스크롤"
              value={`${report.avg_max_depth.toFixed(1)}%`}
            />
          </div>

          <Section title="스크롤 깊이 도달률(어디까지 봤는지 확인)">
            <BarList
              items={report.depth_reach_rates.map((d) => ({
                label: `${d.depth}%`,
                value: d.rate,
                sub: `${d.count}세션`,
              }))}
            />
          </Section>

          <Section title="구간별 이탈률 (어디서 나갔는지 분석)">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: 8 }}>구간</th>
                  <th style={{ padding: 8 }}>도달</th>
                  <th style={{ padding: 8 }}>이탈</th>
                  <th style={{ padding: 8 }}>이탈률</th>
                </tr>
              </thead>
              <tbody>
                {report.section_dropout.map((row) => (
                  <tr key={row.name} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{row.label}</td>
                    <td style={{ padding: 8 }}>{row.reached}</td>
                    <td style={{ padding: 8 }}>{row.dropped}</td>
                    <td style={{ padding: 8 }}>{row.dropout_rate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="디바이스별 스크롤 도달률">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: 8 }}>디바이스</th>
                  <th style={{ padding: 8 }}>세션</th>
                  <th style={{ padding: 8 }}>평균 깊이</th>
                  <th style={{ padding: 8 }}>25%</th>
                  <th style={{ padding: 8 }}>50%</th>
                  <th style={{ padding: 8 }}>75%</th>
                  <th style={{ padding: 8 }}>100%</th>
                </tr>
              </thead>
              <tbody>
                {report.device_depth_reach.map((row) => (
                  <tr key={row.device} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{row.device}</td>
                    <td style={{ padding: 8 }}>{row.sessions}</td>
                    <td style={{ padding: 8 }}>{row.avg_max_depth.toFixed(1)}%</td>
                    <td style={{ padding: 8 }}>{row.reach_25.toFixed(0)}%</td>
                    <td style={{ padding: 8 }}>{row.reach_50.toFixed(0)}%</td>
                    <td style={{ padding: 8 }}>{row.reach_75.toFixed(0)}%</td>
                    <td style={{ padding: 8 }}>{row.reach_100.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="섹션별 클릭 수">
            <BarList
              items={report.section_clicks.map((c) => ({
                label: c.label,
                value: c.count,
                sub: `${c.count}회`,
                max: Math.max(1, ...report.section_clicks.map((x) => x.count)),
              }))}
            />
          </Section>

          <HeatmapHelpText />

          <Section title="섹션 히트맵 (도달률 + 체류 시간)">
            <SectionColorHeatmap
              rows={report.section_heatmap}
              empty={report.total_sessions === 0}
            />
          </Section>

          <Section title="섹션별 평균 체류 시간">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: 8 }}>구간</th>
                  <th style={{ padding: 8 }}>평균 체류</th>
                  <th style={{ padding: 8 }}>총 체류</th>
                  <th style={{ padding: 8 }}>체류 세션</th>
                </tr>
              </thead>
              <tbody>
                {report.section_dwell.map((row) => (
                  <tr key={row.name} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{row.label}</td>
                    <td style={{ padding: 8 }}>{formatDurationSeconds(row.avg_seconds)}</td>
                    <td style={{ padding: 8 }}>{formatDurationSeconds(row.total_seconds)}</td>
                    <td style={{ padding: 8 }}>{row.sessions_with_dwell}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
              화면 중앙이 해당 구간에 있을 때 1초 단위로 누적하며, 약 10~15초마다 또는 이탈 시 전송됩니다.
            </p>
          </Section>

          <Section title="스크롤 히트맵 (10% 단위 · 색상)">
            <ScrollPercentColorHeatmap
              buckets={report.scroll_heatmap}
              empty={report.total_sessions === 0}
            />
          </Section>

          <Section title="클릭 y_ratio 분포 (클릭 위치 분석)">
            <BarList
              items={report.click_y_buckets.map((h) => ({
                label: h.bucket,
                value: h.count,
                sub: `${h.count}회`,
                max: Math.max(1, ...report.click_y_buckets.map((x) => x.count)),
              }))}
            />
          </Section>
        </>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}

function BarList({
  items,
}: {
  items: { label: string; value: number; sub?: string; max?: number }[];
}) {
  const maxVal = items[0]?.max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li key={item.label} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span>{item.label}</span>
            <span style={{ color: "#64748b" }}>{item.sub ?? `${item.value.toFixed(1)}%`}</span>
          </div>
          <div
            style={{
              height: 8,
              background: "#e2e8f0",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (item.value / maxVal) * 100)}%`,
                background: "var(--cta-bg)",
                borderRadius: 4,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
