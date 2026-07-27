import { getLandingSectionByRatio, type LandingSection } from "@/lib/landing-analytics/sections";
import { readDocumentMetrics } from "@/lib/landing-analytics/metrics";

export type SectionDwellEntry = {
  name: string;
  label: string;
  seconds: number;
};

/** 화면 중앙 y_ratio (0~1) */
export function computeCenterYRatio(): number | null {
  const { scrollY, viewportHeight, documentHeight } = readDocumentMetrics();
  if (documentHeight <= 0) return null;
  const centerY = scrollY + viewportHeight / 2;
  return Math.min(1, Math.max(0, centerY / documentHeight));
}

export function getCurrentSection(landingKey: string, sectionsOverride?: LandingSection[] | null) {
  const yRatio = computeCenterYRatio();
  if (yRatio == null) return null;
  return getLandingSectionByRatio(landingKey, yRatio, sectionsOverride);
}

export class SectionDwellAccumulator {
  private readonly landingKey: string;
  private readonly sectionsOverride: LandingSection[] | null;
  private readonly dwell = new Map<string, SectionDwellEntry>();

  constructor(landingKey: string, sectionsOverride?: LandingSection[] | null) {
    this.landingKey = landingKey;
    this.sectionsOverride = sectionsOverride ?? null;
  }

  /** visible 상태에서 1초마다 호출 */
  tick(): void {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    const section = getCurrentSection(this.landingKey, this.sectionsOverride);
    if (!section) return;

    const cur = this.dwell.get(section.name);
    if (cur) {
      cur.seconds += 1;
    } else {
      this.dwell.set(section.name, { name: section.name, label: section.label, seconds: 1 });
    }
  }

  /** 전송할 체류 구간 목록을 반환하고 누적값 초기화 */
  flush(): SectionDwellEntry[] {
    const out: SectionDwellEntry[] = [];
    for (const entry of Array.from(this.dwell.values())) {
      if (entry.seconds >= 1) {
        out.push({ ...entry });
        entry.seconds = 0;
      }
    }
    return out;
  }
}
