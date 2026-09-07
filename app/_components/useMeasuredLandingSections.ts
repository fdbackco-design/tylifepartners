"use client";

import { useEffect, useState } from "react";
import {
  landingSectionsEqual,
  measureDomLandingSections,
} from "@/lib/landing-analytics/measureDomSections";
import type { LandingSection } from "@/lib/landing-analytics/sections";

/**
 * `[data-analytics-section]` 기준 구간을 측정하고, resize/이미지 로드 시 갱신합니다.
 */
export function useMeasuredLandingSections(
  rootSelector?: string
): LandingSection[] | null {
  const [sections, setSections] = useState<LandingSection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const measure = () => {
      if (cancelled) return;
      const root = rootSelector
        ? document.querySelector(rootSelector) ?? document
        : document;
      const next = measureDomLandingSections(root);
      if (next.length === 0) return;
      setSections((prev) => (landingSectionsEqual(prev, next) ? prev : next));
    };

    const schedule = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(measure, 120);
    };

    measure();
    // 이미지·폰트 로드 후 높이 변화 반영
    const raf = window.requestAnimationFrame(() => measure());
    const t1 = window.setTimeout(measure, 400);
    const t2 = window.setTimeout(measure, 1200);

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("load", schedule);
    document.fonts?.ready?.then(schedule).catch(() => {});

    const rootEl = rootSelector ? document.querySelector(rootSelector) : document.body;
    const ro =
      typeof ResizeObserver !== "undefined" && rootEl
        ? new ResizeObserver(schedule)
        : null;
    if (rootEl && ro) ro.observe(rootEl);

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("load", schedule);
      ro?.disconnect();
    };
  }, [rootSelector]);

  return sections;
}
