import { getOrCreateLandingSessionId } from "@/lib/landing-analytics/client";
import {
  computeMaxDepthPercent,
  readDocumentMetrics,
} from "@/lib/landing-analytics/metrics";
import { computeCenterYRatio } from "@/lib/landing-analytics/sectionDwell";
import { getLandingSectionByRatio, type LandingKey } from "@/lib/landing-analytics/sections";

export type SubmissionAnalyticsPayload = {
  analytics_session_id: string;
  max_scroll_depth: number;
  last_section_name: string | null;
  last_section_label: string | null;
};

let activeLandingKey: LandingKey | null = null;
let snapshot: SubmissionAnalyticsPayload | null = null;

export function initSubmissionSnapshot(landingKey: LandingKey): void {
  activeLandingKey = landingKey;
  snapshot = {
    analytics_session_id: getOrCreateLandingSessionId(),
    max_scroll_depth: 0,
    last_section_name: null,
    last_section_label: null,
  };
  refreshSubmissionSnapshot(0);
}

export function refreshSubmissionSnapshot(maxScrollY?: number): void {
  if (!activeLandingKey || !snapshot) return;

  const metrics = readDocumentMetrics();
  const scrollY = maxScrollY ?? metrics.scrollY;
  const depth = computeMaxDepthPercent(
    Math.max(scrollY, 0),
    metrics.viewportHeight,
    metrics.documentHeight
  );
  snapshot.max_scroll_depth = Math.max(snapshot.max_scroll_depth, depth);

  const yRatio = computeCenterYRatio();
  if (yRatio != null) {
    const section = getLandingSectionByRatio(activeLandingKey, yRatio);
    if (section) {
      snapshot.last_section_name = section.name;
      snapshot.last_section_label = section.label;
    }
  }
}

/** 폼 제출 시 API body에 spread */
export function getSubmissionAnalyticsPayload(): Partial<SubmissionAnalyticsPayload> {
  if (!snapshot) return {};
  refreshSubmissionSnapshot();
  return {
    analytics_session_id: snapshot.analytics_session_id,
    max_scroll_depth: Math.round(snapshot.max_scroll_depth * 10) / 10,
    last_section_name: snapshot.last_section_name,
    last_section_label: snapshot.last_section_label,
  };
}
