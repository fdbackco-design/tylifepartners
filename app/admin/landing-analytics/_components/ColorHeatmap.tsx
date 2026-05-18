"use client";

import type { LandingAnalyticsReport } from "@/lib/landing-analytics/aggregate";
import { formatDurationSeconds } from "@/lib/landing-analytics/formatDuration";
import { getHeatColorStyle } from "@/lib/landing-analytics/heatScore";

const tabular: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export function HeatmapHelpText() {
  return (
    <p
      style={{
        margin: "0 0 16px",
        padding: "12px 14px",
        fontSize: 13,
        lineHeight: 1.5,
        color: "#475569",
        background: "#fff7ed",
        border: "1px solid #fed7aa",
        borderRadius: 8,
      }}
    >
      따뜻한 색(빨강·주황)은 사용자가 <strong>많이 도달하고 오래 머문</strong> 구간입니다. 차가운
      색(파랑·회색)은 도달률이 낮거나 빠르게 지나간 구간입니다. 점수는 도달률 70% + 평균 체류
      30%로 계산됩니다.
    </p>
  );
}

export function HeatmapLegend() {
  const levels = [
    { label: "매우 높음", score: 0.85 },
    { label: "높음", score: 0.7 },
    { label: "보통", score: 0.5 },
    { label: "낮음", score: 0.3 },
    { label: "매우 낮음", score: 0.1 },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 16,
        fontSize: 11,
      }}
    >
      {levels.map((l) => {
        const c = getHeatColorStyle(l.score);
        return (
          <span
            key={l.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              borderRadius: 6,
              background: c.background,
              border: `1px solid ${c.border}`,
              color: c.text,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: c.bar,
              }}
            />
            {l.label}
          </span>
        );
      })}
    </div>
  );
}

type SectionHeatmapProps = {
  rows: LandingAnalyticsReport["section_heatmap"];
  empty: boolean;
};

export function SectionColorHeatmap({ rows, empty }: SectionHeatmapProps) {
  if (empty || rows.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
        표시할 세션 데이터가 없습니다. 기간을 넓히거나 랜딩 페이지 방문 후 다시 조회해 주세요.
      </p>
    );
  }

  return (
    <>
      <HeatmapLegend />
      <div
        className="section-heat-mobile"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {rows.map((row) => (
          <SectionHeatCard key={row.name} row={row} />
        ))}
      </div>
      <div className="section-heat-desktop" style={{ display: "none" }}>
        <SectionHeatTable rows={rows} />
      </div>
      <style>{`
        @media (min-width: 720px) {
          .section-heat-mobile { display: none !important; }
          .section-heat-desktop { display: block !important; }
        }
      `}</style>
    </>
  );
}

function SectionHeatCard({ row }: { row: LandingAnalyticsReport["section_heatmap"][number] }) {
  const colors = getHeatColorStyle(row.heat_score);
  return (
    <article
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        background: colors.background,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ display: "flex" }}>
        <div style={{ width: 6, flexShrink: 0, background: colors.bar }} />
        <div style={{ flex: 1, padding: "12px 14px" }}>
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 14,
              fontWeight: 600,
              color: colors.text,
              lineHeight: 1.35,
            }}
          >
            {row.label}
          </h3>
          <SectionHeatMetrics row={row} colors={colors} />
        </div>
      </div>
    </article>
  );
}

function SectionHeatTable({ rows }: { rows: LandingAnalyticsReport["section_heatmap"] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
          <th style={{ padding: 8, width: 8 }} aria-hidden />
          <th style={{ padding: 8 }}>구간</th>
          <th style={{ padding: 8 }}>도달률</th>
          <th style={{ padding: 8 }}>평균 체류</th>
          <th style={{ padding: 8 }}>이탈률</th>
          <th style={{ padding: 8 }}>클릭</th>
          <th style={{ padding: 8 }}>점수</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const colors = getHeatColorStyle(row.heat_score);
          return (
            <tr
              key={row.name}
              style={{
                borderBottom: "1px solid #eee",
                background: colors.background,
              }}
            >
              <td style={{ padding: 0, width: 6 }}>
                <div style={{ width: 6, height: "100%", minHeight: 40, background: colors.bar }} />
              </td>
              <td style={{ padding: 8, fontWeight: 500, color: colors.text }}>{row.label}</td>
              <td style={{ padding: 8, ...tabular }}>{row.reach_rate.toFixed(1)}%</td>
              <td style={{ padding: 8, ...tabular }}>
                {formatDurationSeconds(row.avg_dwell_seconds)}
              </td>
              <td style={{ padding: 8, ...tabular }}>{row.dropout_rate.toFixed(1)}%</td>
              <td style={{ padding: 8, ...tabular }}>{row.click_count}</td>
              <td style={{ padding: 8, ...tabular }}>{(row.heat_score * 100).toFixed(0)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SectionHeatMetrics({
  row,
  colors,
}: {
  row: LandingAnalyticsReport["section_heatmap"][number];
  colors: ReturnType<typeof getHeatColorStyle>;
}) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        margin: 0,
        fontSize: 12,
        ...tabular,
      }}
    >
      <MetricItem label="도달률" value={`${row.reach_rate.toFixed(1)}%`} color={colors.text} />
      <MetricItem
        label="평균 체류"
        value={formatDurationSeconds(row.avg_dwell_seconds)}
        color={colors.text}
      />
      <MetricItem label="이탈률" value={`${row.dropout_rate.toFixed(1)}%`} color={colors.text} />
      <MetricItem label="클릭" value={String(row.click_count)} color={colors.text} />
      <MetricItem label="점수" value={`${(row.heat_score * 100).toFixed(0)}`} color={colors.text} />
    </dl>
  );
}

function MetricItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div>
      <dt style={{ margin: 0, color: "#64748b", fontSize: 11 }}>{label}</dt>
      <dd style={{ margin: "2px 0 0", fontWeight: 600, color }}>{value}</dd>
    </div>
  );
}

type ScrollHeatmapProps = {
  buckets: LandingAnalyticsReport["scroll_heatmap"];
  empty: boolean;
};

export function ScrollPercentColorHeatmap({ buckets, empty }: ScrollHeatmapProps) {
  if (empty || buckets.every((b) => b.count === 0)) {
    return (
      <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
        스크롤 도달 데이터가 없습니다.
      </p>
    );
  }

  const maxRate = Math.max(...buckets.map((b) => b.rate), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b" }}>
        페이지 상단(0%) → 하단(100%) · 색은 해당 구간 <strong>도달 세션 비율</strong> 기준
      </p>
      {buckets.map((bucket) => {
        const colors = getHeatColorStyle(bucket.heat_score);
        const barWidth = Math.max(4, (bucket.rate / maxRate) * 100);
        return (
          <div
            key={bucket.bucket}
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 10,
              minHeight: 36,
            }}
          >
            <span
              style={{
                width: 56,
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
                color: "#64748b",
                alignSelf: "center",
                ...tabular,
              }}
            >
              {bucket.bucket}
            </span>
            <div
              style={{
                flex: 1,
                position: "relative",
                display: "flex",
                alignItems: "center",
                background: colors.background,
                borderRadius: 6,
                overflow: "hidden",
                border: `1px solid ${colors.border}`,
                minHeight: 34,
              }}
            >
              <div
                style={{
                  width: `${barWidth}%`,
                  alignSelf: "stretch",
                  background: colors.bar,
                  opacity: 0.88,
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: colors.text,
                  ...tabular,
                }}
              >
                {bucket.rate.toFixed(1)}% · {bucket.count}세션
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
