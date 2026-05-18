/** 도달률·체류 시간 가중치 (합이 1일 필요 없음 — 정규화된 값에 각각 곱함) */
export const HEAT_SCORE_WEIGHTS = {
  reach: 0.7,
  dwell: 0.3,
} as const;

export type HeatColorLevel = "very-high" | "high" | "medium" | "low" | "very-low";

export type HeatColorStyle = {
  level: HeatColorLevel;
  background: string;
  border: string;
  bar: string;
  text: string;
};

/**
 * heat_score (0~1) = normalizedReach * reachWeight + normalizedDwell * dwellWeight
 * maxSectionAvgDwell이 0이면 dwell 점수는 0
 */
export function computeHeatScore(
  reachRatePercent: number,
  sectionAvgDwellSeconds: number,
  maxSectionAvgDwellSeconds: number,
  weights: { reach?: number; dwell?: number } = {}
): number {
  const reachW = weights.reach ?? HEAT_SCORE_WEIGHTS.reach;
  const dwellW = weights.dwell ?? HEAT_SCORE_WEIGHTS.dwell;
  const normalizedReach = Math.min(1, Math.max(0, reachRatePercent / 100));
  const normalizedDwell =
    maxSectionAvgDwellSeconds > 0
      ? Math.min(1, Math.max(0, sectionAvgDwellSeconds / maxSectionAvgDwellSeconds))
      : 0;
  return Math.min(1, Math.max(0, normalizedReach * reachW + normalizedDwell * dwellW));
}

/** 10% 구간 등 체류 데이터 없을 때 — 도달률만 반영 */
export function computeReachOnlyHeatScore(reachRatePercent: number): number {
  return computeHeatScore(reachRatePercent, 0, 1, { reach: 1, dwell: 0 });
}

export function getHeatColorStyle(score: number): HeatColorStyle {
  const s = Math.min(1, Math.max(0, score));
  if (s >= 0.8) {
    return {
      level: "very-high",
      background: "#fef2f2",
      border: "#fca5a5",
      bar: "#ef4444",
      text: "#991b1b",
    };
  }
  if (s >= 0.6) {
    return {
      level: "high",
      background: "#fff7ed",
      border: "#fdba74",
      bar: "#f97316",
      text: "#9a3412",
    };
  }
  if (s >= 0.4) {
    return {
      level: "medium",
      background: "#fefce8",
      border: "#fde047",
      bar: "#eab308",
      text: "#854d0e",
    };
  }
  if (s >= 0.2) {
    return {
      level: "low",
      background: "#eff6ff",
      border: "#93c5fd",
      bar: "#3b82f6",
      text: "#1e40af",
    };
  }
  return {
    level: "very-low",
    background: "#f8fafc",
    border: "#cbd5e1",
    bar: "#94a3b8",
    text: "#475569",
  };
}

/** CSS class 이름 (필요 시 확장용) */
export function getHeatColorClass(score: number): string {
  return `heat-${getHeatColorStyle(score).level}`;
}
