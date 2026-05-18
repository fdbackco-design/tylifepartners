"use client";

// TODO: 개인정보처리방침에 랜딩 분석 이벤트(스크롤·클릭 좌표·체류·섹션별 체류, 비식별 session_id) 수집 항목 반영

import { useEffect, useRef } from "react";
import { buildBasePayload, sendLandingEvent } from "@/lib/landing-analytics/client";
import { getLandingSectionByRatio } from "@/lib/landing-analytics/sections";
import type { LandingKey } from "@/lib/landing-analytics/sections";
import {
  computeMaxDepthPercent,
  readDocumentMetrics,
} from "@/lib/landing-analytics/metrics";
import {
  initSubmissionSnapshot,
  refreshSubmissionSnapshot,
} from "@/lib/landing-analytics/submissionSnapshot";
import { SectionDwellAccumulator } from "@/lib/landing-analytics/sectionDwell";
import type { LandingTrackPayload } from "@/lib/landing-analytics/types";
import { SCROLL_DEPTH_MILESTONES } from "@/lib/landing-analytics/types";

const HEARTBEAT_MS_MIN = 10_000;
const HEARTBEAT_MS_MAX = 15_000;
const DWELL_TICK_MS = 1_000;

type Props = {
  landingKey: LandingKey;
};

export default function LandingAnalyticsTracker({ landingKey }: Props) {
  const maxScrollYRef = useRef(0);
  const maxDepthRef = useRef(0);
  const sentDepthsRef = useRef<Set<number>>(new Set());
  const startMsRef = useRef(0);
  const leaveSentRef = useRef(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dwellAccumulatorRef = useRef<SectionDwellAccumulator | null>(null);

  useEffect(() => {
    startMsRef.current = Date.now();
    leaveSentRef.current = false;
    dwellAccumulatorRef.current = new SectionDwellAccumulator(landingKey);
    initSubmissionSnapshot(landingKey);

    const base = () => buildBasePayload(landingKey);

    const flushSectionDwell = (beacon = false) => {
      const acc = dwellAccumulatorRef.current;
      if (!acc) return;
      const entries = acc.flush();
      if (entries.length === 0) return;

      const { viewportWidth, viewportHeight } = readDocumentMetrics();
      for (const entry of entries) {
        sendLandingEvent(
          {
            ...base(),
            event_type: "section_dwell",
            section_name: entry.name,
            section_label: entry.label,
            duration_seconds: entry.seconds,
            viewport_width: viewportWidth,
            viewport_height: viewportHeight,
          },
          { beacon }
        );
      }
    };

    const updateScroll = () => {
      const { scrollY, viewportHeight, documentHeight } = readDocumentMetrics();
      maxScrollYRef.current = Math.max(maxScrollYRef.current, scrollY);
      refreshSubmissionSnapshot(maxScrollYRef.current);
      const depth = computeMaxDepthPercent(
        maxScrollYRef.current,
        viewportHeight,
        documentHeight
      );
      maxDepthRef.current = Math.max(maxDepthRef.current, depth);

      for (const milestone of SCROLL_DEPTH_MILESTONES) {
        if (depth >= milestone && !sentDepthsRef.current.has(milestone)) {
          sentDepthsRef.current.add(milestone);
          const payload: LandingTrackPayload = {
            ...base(),
            event_type: "scroll_depth",
            depth: milestone,
            max_depth: Math.round(maxDepthRef.current * 10) / 10,
            document_height: documentHeight,
          };
          sendLandingEvent(payload);
        }
      }
    };

    const durationSeconds = () =>
      Math.max(0, Math.round((Date.now() - startMsRef.current) / 1000));

    const sendLeave = (beacon = true) => {
      if (leaveSentRef.current) return;
      leaveSentRef.current = true;
      flushSectionDwell(beacon);
      const { viewportHeight, documentHeight } = readDocumentMetrics();
      updateScroll();
      const payload: LandingTrackPayload = {
        ...base(),
        event_type: "leave",
        max_depth: Math.round(maxDepthRef.current * 10) / 10,
        duration_seconds: durationSeconds(),
        document_height: documentHeight,
        viewport_height: viewportHeight,
      };
      sendLandingEvent(payload, { beacon });
    };

    const sendHeartbeat = () => {
      if (document.visibilityState !== "visible") return;
      updateScroll();
      flushSectionDwell();
      const { documentHeight } = readDocumentMetrics();
      sendLandingEvent({
        ...base(),
        event_type: "heartbeat",
        max_depth: Math.round(maxDepthRef.current * 10) / 10,
        duration_seconds: durationSeconds(),
        document_height: documentHeight,
      });
    };

    const scheduleHeartbeat = () => {
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      const delay =
        HEARTBEAT_MS_MIN +
        Math.floor(Math.random() * (HEARTBEAT_MS_MAX - HEARTBEAT_MS_MIN + 1));
      heartbeatTimerRef.current = setTimeout(() => {
        sendHeartbeat();
        scheduleHeartbeat();
      }, delay);
    };

    sendLandingEvent({ ...base(), event_type: "page_view" });
    updateScroll();
    scheduleHeartbeat();

    dwellTickRef.current = setInterval(() => {
      dwellAccumulatorRef.current?.tick();
    }, DWELL_TICK_MS);

    const onScroll = () => updateScroll();
    const onResize = () => updateScroll();

    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") {
          return;
        }
      }

      const { scrollY, viewportWidth, viewportHeight, documentHeight } =
        readDocumentMetrics();
      if (viewportWidth <= 0 || documentHeight <= 0) return;

      const x_ratio = Math.min(1, Math.max(0, e.clientX / viewportWidth));
      const absoluteY = e.clientY + scrollY;
      const y_ratio = Math.min(1, Math.max(0, absoluteY / documentHeight));
      const section = getLandingSectionByRatio(landingKey, y_ratio);

      sendLandingEvent({
        ...base(),
        event_type: "click",
        x_ratio: Math.round(x_ratio * 10000) / 10000,
        y_ratio: Math.round(y_ratio * 10000) / 10000,
        section_name: section?.name,
        section_label: section?.label,
        document_height: documentHeight,
        viewport_width: viewportWidth,
        viewport_height: viewportHeight,
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushSectionDwell(true);
        sendLeave(true);
      }
    };
    const onPageHide = () => sendLeave(true);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("click", onClick, { capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      if (dwellTickRef.current) clearInterval(dwellTickRef.current);
      sendLeave(true);
    };
  }, [landingKey]);

  return null;
}
