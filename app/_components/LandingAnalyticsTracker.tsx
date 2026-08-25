"use client";

// TODO: 개인정보처리방침에 랜딩 분석 이벤트(스크롤·클릭 좌표·체류·섹션별 체류, 비식별 session_id/visitor_id) 수집 항목 반영

import { useEffect, useRef } from "react";
import { buildBasePayload, sendLandingEvent } from "@/lib/landing-analytics/client";
import { getLandingSectionByRatio, type LandingSection } from "@/lib/landing-analytics/sections";
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
/** 스크롤 샘플: 최소 시간 간격 */
const SCROLL_SAMPLE_MIN_MS = 3_000;
/** 스크롤 샘플: 깊이 버킷 단위(%) — 같은 버킷은 세션당 1회 */
const SCROLL_SAMPLE_BUCKET = 10;

type Props = {
  landingKey: string;
  /** managed landing 등 DB 섹션 오버라이드 */
  sections?: LandingSection[] | null;
};

function isCtaTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const el = target.closest(
    "button, a[href], [role='button'], [data-analytics-cta], .cta, .btn, [class*='cta'], [class*='sheet-open']"
  );
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return false;
  }
  return true;
}

export default function LandingAnalyticsTracker({ landingKey, sections }: Props) {
  const maxScrollYRef = useRef(0);
  const maxDepthRef = useRef(0);
  const sentDepthsRef = useRef<Set<number>>(new Set());
  const sentSampleBucketsRef = useRef<Set<number>>(new Set());
  const lastSampleAtRef = useRef(0);
  const startMsRef = useRef(0);
  const leaveSentRef = useRef(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dwellAccumulatorRef = useRef<SectionDwellAccumulator | null>(null);

  useEffect(() => {
    startMsRef.current = Date.now();
    leaveSentRef.current = false;
    sentDepthsRef.current = new Set();
    sentSampleBucketsRef.current = new Set();
    lastSampleAtRef.current = 0;
    dwellAccumulatorRef.current = new SectionDwellAccumulator(landingKey, sections);
    initSubmissionSnapshot(landingKey, sections);

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

    const maybeSendScrollSample = (depth: number, documentHeight: number, force = false) => {
      const bucket = Math.min(100, Math.floor(depth / SCROLL_SAMPLE_BUCKET) * SCROLL_SAMPLE_BUCKET);
      if (bucket <= 0) return;
      if (sentSampleBucketsRef.current.has(bucket)) return;
      const now = Date.now();
      if (!force && now - lastSampleAtRef.current < SCROLL_SAMPLE_MIN_MS) return;

      sentSampleBucketsRef.current.add(bucket);
      lastSampleAtRef.current = now;
      const y_ratio = Math.min(1, Math.max(0, depth / 100));
      sendLandingEvent({
        ...base(),
        event_type: "scroll_sample",
        event_key: `scroll_sample:${bucket}`,
        max_depth: Math.round(depth * 10) / 10,
        depth: bucket,
        y_ratio: Math.round(y_ratio * 10000) / 10000,
        document_height: documentHeight,
      });
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
            event_key: `scroll_depth:${milestone}`,
            depth: milestone,
            max_depth: Math.round(maxDepthRef.current * 10) / 10,
            document_height: documentHeight,
          };
          sendLandingEvent(payload);
        }
      }

      maybeSendScrollSample(maxDepthRef.current, documentHeight);
    };

    const durationSeconds = () =>
      Math.max(0, Math.round((Date.now() - startMsRef.current) / 1000));

    const sendLeave = (beacon = true) => {
      if (leaveSentRef.current) return;
      leaveSentRef.current = true;
      flushSectionDwell(beacon);
      const { viewportHeight, documentHeight } = readDocumentMetrics();
      updateScroll();
      maybeSendScrollSample(maxDepthRef.current, documentHeight, true);
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

    sendLandingEvent({ ...base(), event_type: "page_view", event_key: "page_view" });
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
      const section = getLandingSectionByRatio(landingKey, y_ratio, sections);
      const cta = isCtaTarget(target);

      sendLandingEvent({
        ...base(),
        event_type: cta ? "cta_click" : "click",
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
  }, [landingKey, sections]);

  return null;
}
