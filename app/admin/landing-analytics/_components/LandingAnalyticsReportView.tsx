import type { LandingAnalyticsReport } from "@/lib/landing-analytics/aggregate";
import {
  HeatmapHelpText,
  SectionColorHeatmap,
} from "@/app/admin/landing-analytics/_components/ColorHeatmap";

export function LandingAnalyticsReportView({
  report,
  submissionCountHint,
  variant = "full",
}: {
  report: LandingAnalyticsReport;
  submissionCountHint?: string;
  /** lead: 고객 스크롤 히트맵 — 핵심 지표만 표시 */
  variant?: "full" | "lead";
}) {
  const showExtras = variant === "full";

  return (
    <div className="crm-analytics-report">
      <div className="crm-analytics-stats">
        <StatCard label="방문 세션" value={String(report.total_sessions)} />
        <StatCard label="평균 체류" value={`${Math.round(report.avg_duration_seconds)}초`} />
        <StatCard label="평균 스크롤" value={`${report.avg_max_depth.toFixed(1)}%`} />
      </div>

      <Section title="스크롤 깊이 도달률">
        <BarList
          items={report.depth_reach_rates.map((d) => ({
            label: `${d.depth}%`,
            value: d.rate,
            sub: `${d.count}세션`,
          }))}
        />
      </Section>

      <Section title="구간별 이탈률">
        <div className="crm-heat-table-wrap">
          <table className="crm-heat-table">
            <thead>
              <tr>
                <th>구간</th>
                <th>도달</th>
                <th>이탈</th>
                <th>이탈률</th>
                <th>다음 도달</th>
                <th>신청</th>
              </tr>
            </thead>
            <tbody>
              {report.section_dropout.map((row) => (
                <tr key={row.name}>
                  <td className="crm-heat-table-label">{row.label}</td>
                  <td>{row.reached}</td>
                  <td>{row.dropped}</td>
                  <td>{row.dropout_rate.toFixed(1)}%</td>
                  <td>{row.next_section_reach_rate.toFixed(1)}%</td>
                  <td>{row.submission_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="crm-analytics-hint">
          {submissionCountHint ??
            "신청 시 구간: 선택 기간·랜딩에서 상담 신청 시 해당 구간에 있던 건수(리드 DB 기준)."}
        </p>
      </Section>

      {showExtras && (
        <>
          <Section title="디바이스별 도달률">
            <div className="crm-heat-table-wrap">
              <table className="crm-heat-table">
                <thead>
                  <tr>
                    <th>디바이스</th>
                    <th>세션</th>
                    <th>평균</th>
                    <th>25%</th>
                    <th>50%</th>
                    <th>75%</th>
                    <th>100%</th>
                  </tr>
                </thead>
                <tbody>
                  {report.device_depth_reach.map((row) => (
                    <tr key={row.device}>
                      <td className="crm-heat-table-label">
                        {row.device === "mobile"
                          ? "모바일"
                          : row.device === "tablet"
                            ? "태블릿"
                            : row.device === "desktop"
                              ? "데스크톱"
                              : row.device}
                      </td>
                      <td>{row.sessions}</td>
                      <td>{row.avg_max_depth.toFixed(1)}%</td>
                      <td>{row.reach_25.toFixed(0)}%</td>
                      <td>{row.reach_50.toFixed(0)}%</td>
                      <td>{row.reach_75.toFixed(0)}%</td>
                      <td>{row.reach_100.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

          <Section title="섹션 히트맵">
            <SectionColorHeatmap rows={report.section_heatmap} empty={report.total_sessions === 0} />
          </Section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="crm-analytics-stat">
      <div className="crm-analytics-stat-label">{label}</div>
      <div className="crm-analytics-stat-value">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="crm-analytics-section">
      <h2 className="crm-analytics-section-title">{title}</h2>
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
    <ul className="crm-analytics-bars">
      {items.map((item) => (
        <li key={item.label}>
          <div className="crm-analytics-bar-meta">
            <span className="crm-analytics-bar-label">{item.label}</span>
            <span className="crm-analytics-bar-sub">
              {item.sub ?? `${item.value.toFixed(1)}%`}
            </span>
          </div>
          <div className="crm-analytics-bar-track">
            <div
              className="crm-analytics-bar-fill"
              style={{ width: `${Math.min(100, (item.value / maxVal) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
