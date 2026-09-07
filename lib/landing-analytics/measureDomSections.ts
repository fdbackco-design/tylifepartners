import type { LandingSection } from "@/lib/landing-analytics/sections";

const SECTION_ATTR = "data-analytics-section";
const LABEL_ATTR = "data-analytics-label";

/**
 * DOM에 표시된 `[data-analytics-section]` 요소 위치로
 * 문서 높이 대비 start/end(y_ratio 0~1) 섹션 구간을 계산합니다.
 * 뷰포트·이미지 로딩에 따라 달라지므로 클라이언트에서 측정합니다.
 */
export function measureDomLandingSections(
  root: ParentNode = typeof document !== "undefined" ? document : (null as unknown as ParentNode)
): LandingSection[] {
  if (!root || typeof document === "undefined") return [];

  const docHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0
  );
  if (docHeight <= 0) return [];

  const nodes = Array.from(root.querySelectorAll<HTMLElement>(`[${SECTION_ATTR}]`));
  if (nodes.length === 0) return [];

  const raw = nodes
    .map((el, index) => {
      const name = (el.getAttribute(SECTION_ATTR) || "").trim();
      if (!name) return null;
      const label =
        (el.getAttribute(LABEL_ATTR) || "").trim() ||
        `${index + 1}. ${name}`;
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = top + Math.max(rect.height, 1);
      return {
        name,
        label,
        start: clamp01(top / docHeight),
        end: clamp01(bottom / docHeight),
      };
    })
    .filter((s): s is LandingSection => Boolean(s))
    .sort((a, b) => a.start - b.start);

  if (raw.length === 0) return [];

  // 겹침·틈 없이 연속 구간으로 정규화 (첫 start=0, 마지막 end=1)
  const normalized: LandingSection[] = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    const next = raw[i + 1];
    const start = i === 0 ? 0 : normalized[i - 1].end;
    let end = next ? Math.max(start + 0.0001, (cur.end + next.start) / 2) : 1;
    if (i === raw.length - 1) end = 1;
    end = Math.min(1, Math.max(start + 0.0001, end));
    normalized.push({
      name: cur.name,
      label: cur.label,
      start: round4(start),
      end: round4(end),
      memo: cur.memo,
    });
  }
  return normalized;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 두 섹션 정의가 히트맵용으로 실질 동일한지 */
export function landingSectionsEqual(
  a: LandingSection[] | null | undefined,
  b: LandingSection[] | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].name !== b[i].name ||
      a[i].label !== b[i].label ||
      Math.abs(a[i].start - b[i].start) > 0.002 ||
      Math.abs(a[i].end - b[i].end) > 0.002
    ) {
      return false;
    }
  }
  return true;
}
