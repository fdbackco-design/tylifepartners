import type { LandingAnalyticsReport } from "@/lib/landing-analytics/aggregate";
import {
  HeatmapHelpText,
  SectionColorHeatmap,
} from "@/app/admin/landing-analytics/_components/ColorHeatmap";

export function LandingAnalyticsReportView({
  report,
  submissionCountHint,
}: {
  report: LandingAnalyticsReport;
  submissionCountHint?: string;
}) {
  return (
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
        <StatCard label="평균 체류" value={`${Math.round(report.avg_duration_seconds)}초`} />
        <StatCard label="평균 최대 스크롤" value={`${report.avg_max_depth.toFixed(1)}%`} />
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
              <th style={{ padding: 8 }}>다음 섹션 도달률</th>
              <th style={{ padding: 8 }}>신청 시 구간</th>
            </tr>
          </thead>
          <tbody>
            {report.section_dropout.map((row) => (
              <tr key={row.name} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>{row.label}</td>
                <td style={{ padding: 8 }}>{row.reached}</td>
                <td style={{ padding: 8 }}>{row.dropped}</td>
                <td style={{ padding: 8 }}>{row.dropout_rate.toFixed(1)}%</td>
                <td style={{ padding: 8 }}>{row.next_section_reach_rate.toFixed(1)}%</td>
                <td style={{ padding: 8 }}>{row.submission_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
          {submissionCountHint ??
            "신청 시 구간: 선택 기간·랜딩에서 상담 신청 시 해당 구간에 있던 건수(리드 DB 기준)."}
        </p>
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
        <SectionColorHeatmap rows={report.section_heatmap} empty={report.total_sessions === 0} />
      </Section>
    </>
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
