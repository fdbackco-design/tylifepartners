import {
  aggregateLandingAnalytics,
  type LandingAnalyticsReport,
} from "@/lib/landing-analytics/aggregate";
import type { LandingEventAggregateRow } from "@/lib/landing-analytics/eventRow";
import { getDeviceType } from "@/lib/landing-analytics/device";
import {
  getLandingSections,
  landingKeyFromEntryPage,
  type LandingSection,
} from "@/lib/landing-analytics/sections";
import type { LeadTable } from "@/lib/landing-analytics/linkSession";
import { getManagedLandingSectionsByKey } from "@/lib/managedLandings/store";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SCROLL_DEPTH_MILESTONES } from "@/lib/landing-analytics/types";
import { computeHeatScore } from "@/lib/landing-analytics/heatScore";

export type LeadHeatmapResult = {
  lead: {
    id: string;
    name: string;
    phone: string;
    entry_page: string | null;
    last_section_name: string | null;
    last_section_label: string | null;
    max_scroll_depth: number | null;
  };
  landing_key: string;
  session_ids: string[];
  event_count: number;
  report: LandingAnalyticsReport;
};

const EVENT_SELECT =
  "session_id, event_type, depth, max_depth, duration_seconds, section_name, section_label, y_ratio, device_type, viewport_width, user_agent, landing_key, visitor_id, created_at";

function pickLandingKey(opts: {
  entryPage: string | null;
  events: Array<{ landing_key?: string | null }>;
  linkLandingKeys: string[];
}): string {
  const fromEntry = landingKeyFromEntryPage(opts.entryPage);
  if (fromEntry) return fromEntry;

  for (const k of opts.linkLandingKeys) {
    if (k && k !== "unknown" && !k.startsWith("/")) return k;
    const mapped = landingKeyFromEntryPage(k);
    if (mapped) return mapped;
  }

  const counts = new Map<string, number>();
  for (const ev of opts.events) {
    const k = ev.landing_key;
    if (!k || k === "unknown") continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = "landing_0715s";
  let bestN = 0;
  for (const [k, n] of Array.from(counts.entries())) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function hasUsefulBehavior(events: LandingEventAggregateRow[]): boolean {
  return events.some(
    (ev) =>
      ev.event_type === "scroll_depth" ||
      ev.event_type === "scroll_sample" ||
      ev.event_type === "section_dwell" ||
      ev.event_type === "click" ||
      ev.event_type === "cta_click" ||
      ev.event_type === "heartbeat" ||
      ev.event_type === "leave" ||
      (ev.max_depth != null && ev.max_depth > 0)
  );
}

function maxDepthFromEvents(events: LandingEventAggregateRow[]): number {
  let max = 0;
  for (const ev of events) {
    if (ev.max_depth != null && Number.isFinite(ev.max_depth)) {
      max = Math.max(max, ev.max_depth);
    }
    if (
      (ev.event_type === "scroll_depth" || ev.event_type === "scroll_sample") &&
      ev.depth != null &&
      Number.isFinite(ev.depth)
    ) {
      max = Math.max(max, ev.depth);
    }
  }
  return Math.min(100, Math.max(0, max));
}

function inferDeviceFromEvents(events: LandingEventAggregateRow[]): string | null {
  for (const ev of events) {
    if (ev.device_type && ["mobile", "tablet", "desktop"].includes(ev.device_type)) {
      return ev.device_type;
    }
  }
  for (const ev of events) {
    if (ev.viewport_width != null && Number.isFinite(ev.viewport_width) && ev.viewport_width > 0) {
      return getDeviceType(ev.viewport_width);
    }
  }
  for (const ev of events) {
    const ua = String(ev.user_agent ?? "").toLowerCase();
    if (!ua) continue;
    if (/ipad|tablet|kindle|silk|playbook/.test(ua)) return "tablet";
    if (/mobi|iphone|android|webos|blackberry|opera mini|iemobile/.test(ua)) return "mobile";
    return "desktop";
  }
  return null;
}

/** 신청 구간·스냅샷 깊이를 기준으로 단일 고객 도달 깊이 결정 */
function resolveEffectiveDepth(opts: {
  eventMaxDepth: number;
  leadMaxDepth: number | null;
  lastSectionName: string | null;
  sections: LandingSection[];
}): number {
  const submitIdx = opts.lastSectionName
    ? opts.sections.findIndex((s) => s.name === opts.lastSectionName)
    : -1;

  let depth = opts.eventMaxDepth;
  const leadDepth = Number(opts.leadMaxDepth ?? 0);
  if (Number.isFinite(leadDepth) && leadDepth > 0) {
    depth = Math.max(depth, leadDepth);
  }

  // 신청 구간이 있으면, 그 구간 끝까지만 도달한 것으로 캡 (과대 스크롤·타 세션 오염 방지)
  if (submitIdx >= 0) {
    const sec = opts.sections[submitIdx];
    const sectionCap = Math.min(100, Math.max(sec.end * 100, sec.start * 100 + 1));
    if (depth <= 0) {
      depth = ((sec.start + sec.end) / 2) * 100;
    } else {
      depth = Math.min(depth, sectionCap);
    }
  }

  return Math.min(100, Math.max(0, depth));
}

function rebuildLeadDropout(
  sections: LandingSection[],
  lastSectionName: string | null,
  effectiveDepth: number
): LandingAnalyticsReport["section_dropout"] {
  const y = effectiveDepth / 100;
  const submitIdx = lastSectionName
    ? sections.findIndex((s) => s.name === lastSectionName)
    : -1;

  return sections.map((section, index) => {
    const nextStart = sections[index + 1]?.start ?? 1;
    let reached = y >= section.start ? 1 : 0;
    let dropped = reached === 1 && y < nextStart ? 1 : 0;

    // 신청 구간이 있으면 그 지점에서 이탈(전환)로 표시
    if (submitIdx >= 0) {
      if (index < submitIdx) {
        reached = 1;
        dropped = 0;
      } else if (index === submitIdx) {
        reached = 1;
        dropped = 1;
      } else {
        reached = 0;
        dropped = 0;
      }
    }

    const next_section_reached = Math.max(0, reached - dropped);
    return {
      name: section.name,
      label: section.label,
      reached,
      dropped,
      dropout_rate: reached > 0 ? (dropped / reached) * 100 : 0,
      next_section_reached,
      next_section_reach_rate: reached > 0 ? (next_section_reached / reached) * 100 : 0,
      submission_count: lastSectionName && section.name === lastSectionName ? 1 : 0,
    };
  });
}

function applyLeadDepthReach(
  report: LandingAnalyticsReport,
  effectiveDepth: number
): void {
  const milestones = [25, 50, 75, 100];
  report.avg_max_depth = effectiveDepth;
  report.depth_reach_rates = milestones.map((depth) => {
    const hit = effectiveDepth >= depth ? 1 : 0;
    return {
      depth,
      count: hit,
      rate: hit * 100,
    };
  });
}

function applyLeadDevice(
  report: LandingAnalyticsReport,
  device: string | null,
  effectiveDepth: number
): void {
  if (!device) {
    report.device_depth_reach = [];
    return;
  }
  const reach = (d: number) => (effectiveDepth >= d ? 100 : 0);
  report.device_depth_reach = [
    {
      device,
      sessions: Math.max(1, report.total_sessions),
      avg_max_depth: effectiveDepth,
      reach_25: reach(25),
      reach_50: reach(50),
      reach_75: reach(75),
      reach_100: reach(100),
    },
  ];
}

async function loadEventsForSessions(
  sessionIds: string[]
): Promise<LandingEventAggregateRow[]> {
  if (!sessionIds.length) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("landing_events")
    .select(EVENT_SELECT)
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) {
    console.warn("[landing] loadLeadHeatmapReport events:", error.message);
    return [];
  }
  return (data ?? []) as LandingEventAggregateRow[];
}

/**
 * 상담 신청에 연결된 세션만 사용.
 * visitor 전체 이력을 합치지 않음(다른 방문의 깊은 스크롤로 전 구간 도달처럼 보이는 문제 방지).
 */
async function resolvePrimarySessionEvents(opts: {
  leadTable: LeadTable;
  leadId: string;
  analyticsSessionId: string | null;
  analyticsVisitorId: string | null;
}): Promise<{ sessionIds: string[]; events: LandingEventAggregateRow[]; linkLandingKeys: string[] }> {
  const supabase = getSupabaseAdmin();
  const linkedIds = new Set<string>();

  const { data: links } = await supabase
    .from("landing_lead_sessions")
    .select("session_id, landing_key")
    .eq("lead_table", opts.leadTable)
    .eq("lead_id", opts.leadId);

  for (const row of links ?? []) {
    if (row.session_id) linkedIds.add(row.session_id);
  }
  if (opts.analyticsSessionId) linkedIds.add(opts.analyticsSessionId);

  const { data: linkedEvents } = await supabase
    .from("landing_events")
    .select("session_id")
    .eq("lead_table", opts.leadTable)
    .eq("lead_id", opts.leadId)
    .limit(200);
  for (const row of linkedEvents ?? []) {
    if (row.session_id) linkedIds.add(row.session_id);
  }

  const primaryIds = Array.from(linkedIds).filter(Boolean);
  let events = await loadEventsForSessions(primaryIds);

  // 연결 세션에 행동 이벤트가 없고 visitor만 있을 때: 동일 visitor의 최신 세션 1개만 사용
  if (!hasUsefulBehavior(events) && opts.analyticsVisitorId) {
    const { data: visitorRows } = await supabase
      .from("landing_events")
      .select(EVENT_SELECT)
      .eq("visitor_id", opts.analyticsVisitorId)
      .order("created_at", { ascending: false })
      .limit(400);
    const visitorEvents = (visitorRows ?? []) as LandingEventAggregateRow[];
    const bySession = new Map<string, LandingEventAggregateRow[]>();
    for (const ev of visitorEvents) {
      if (!ev.session_id) continue;
      const list = bySession.get(ev.session_id) ?? [];
      list.push(ev);
      bySession.set(ev.session_id, list);
    }

    let bestId: string | null = null;
    let bestScore = -1;
    for (const [sid, list] of Array.from(bySession.entries())) {
      if (!hasUsefulBehavior(list)) continue;
      const score = list.length + maxDepthFromEvents(list);
      if (score > bestScore) {
        bestScore = score;
        bestId = sid;
      }
    }
    if (bestId) {
      const chosen = (bySession.get(bestId) ?? []).slice().reverse();
      return {
        sessionIds: [bestId],
        events: chosen,
        linkLandingKeys: (links ?? []).map((l) => String(l.landing_key ?? "")).filter(Boolean),
      };
    }
  }

  return {
    sessionIds: primaryIds,
    events,
    linkLandingKeys: (links ?? []).map((l) => String(l.landing_key ?? "")).filter(Boolean),
  };
}

/** 상담 신청 고객 세션만으로 히트맵 리포트 생성 */
export async function loadLeadHeatmapReport(
  leadTable: LeadTable,
  leadId: string
): Promise<LeadHeatmapResult | null> {
  const supabase = getSupabaseAdmin();
  const { data: lead, error } = await supabase
    .from(leadTable)
    .select(
      "id, name, phone, entry_page, analytics_session_id, analytics_visitor_id, last_section_name, last_section_label, max_scroll_depth"
    )
    .eq("id", leadId)
    .maybeSingle();

  if (error || !lead) return null;

  const leadRow = lead as {
    id: string;
    name: string;
    phone: string;
    entry_page: string | null;
    analytics_session_id: string | null;
    analytics_visitor_id: string | null;
    last_section_name: string | null;
    last_section_label: string | null;
    max_scroll_depth: number | null;
  };

  const resolved = await resolvePrimarySessionEvents({
    leadTable,
    leadId,
    analyticsSessionId: leadRow.analytics_session_id,
    analyticsVisitorId: leadRow.analytics_visitor_id,
  });

  let events = resolved.events;
  const sessionIds = resolved.sessionIds.length
    ? resolved.sessionIds
    : leadRow.analytics_session_id
      ? [leadRow.analytics_session_id]
      : [];

  let landingKey = pickLandingKey({
    entryPage: leadRow.entry_page,
    events,
    linkLandingKeys: resolved.linkLandingKeys,
  });

  // 해당 랜딩 이벤트만 유지 (다른 랜딩 방문 혼입 방지)
  const scopedEvents = events.filter(
    (ev) => !ev.landing_key || ev.landing_key === "unknown" || ev.landing_key === landingKey
  );
  if (hasUsefulBehavior(scopedEvents)) {
    events = scopedEvents;
  } else {
    // entry_page 매핑이 이벤트와 다르면 이벤트 다수 키로 재선택
    const keyFromEvents = pickLandingKey({
      entryPage: null,
      events,
      linkLandingKeys: resolved.linkLandingKeys,
    });
    if (keyFromEvents) {
      landingKey = keyFromEvents;
      const scopedAlt = events.filter(
        (ev) => !ev.landing_key || ev.landing_key === "unknown" || ev.landing_key === landingKey
      );
      if (hasUsefulBehavior(scopedAlt)) events = scopedAlt;
    }
  }

  const managedSections = await getManagedLandingSectionsByKey(landingKey);
  const sections: LandingSection[] = managedSections?.length
    ? managedSections
    : getLandingSections(landingKey);

  const eventMaxDepth = maxDepthFromEvents(events);
  const effectiveDepth = resolveEffectiveDepth({
    eventMaxDepth,
    leadMaxDepth: leadRow.max_scroll_depth,
    lastSectionName: leadRow.last_section_name,
    sections,
  });

  // 집계용으로 유효 깊이를 반영한 샘플 1건 보강 (실제 클릭/체류 이벤트는 유지)
  if (effectiveDepth > 0 && sessionIds[0]) {
    const synth: LandingEventAggregateRow[] = [
      {
        session_id: sessionIds[0],
        event_type: "scroll_sample",
        depth: Math.floor(effectiveDepth / 5) * 5 || effectiveDepth,
        max_depth: effectiveDepth,
        y_ratio: effectiveDepth / 100,
        landing_key: landingKey,
        device_type: inferDeviceFromEvents(events),
      },
    ];
    for (const milestone of SCROLL_DEPTH_MILESTONES) {
      if (effectiveDepth >= milestone) {
        synth.push({
          session_id: sessionIds[0],
          event_type: "scroll_depth",
          depth: milestone,
          max_depth: effectiveDepth,
          landing_key: landingKey,
          device_type: inferDeviceFromEvents(events),
        });
      }
    }
    events = [...events, ...synth];
  }

  const report = aggregateLandingAnalytics(landingKey, events, managedSections);

  // 단일 고객: 구간 이탈/신청 구간은 신청 스냅샷 기준으로 재작성
  report.total_sessions = Math.max(1, report.total_sessions || (events.length ? 1 : 0));
  if (report.total_sessions > 0 || effectiveDepth > 0 || leadRow.last_section_name) {
    report.total_sessions = Math.max(1, report.total_sessions);
    report.section_dropout = rebuildLeadDropout(
      sections,
      leadRow.last_section_name,
      effectiveDepth
    );
    applyLeadDepthReach(report, effectiveDepth);
    applyLeadDevice(report, inferDeviceFromEvents(events), effectiveDepth);

    const maxSectionAvgDwell = Math.max(0, ...report.section_dwell.map((d) => d.avg_seconds));
    const dropoutByName = new Map(report.section_dropout.map((d) => [d.name, d]));
    const dwellByName = new Map(report.section_dwell.map((d) => [d.name, d]));
    const clicksByName = new Map(report.section_clicks.map((c) => [c.name, c]));
    report.section_heatmap = sections.map((sec) => {
      const dropout = dropoutByName.get(sec.name);
      const dwell = dwellByName.get(sec.name);
      const clicks = clicksByName.get(sec.name);
      const reach_rate = ((dropout?.reached ?? 0) / report.total_sessions) * 100;
      const avg_dwell_seconds = dwell?.avg_seconds ?? 0;
      return {
        name: sec.name,
        label: sec.label,
        reach_rate,
        avg_dwell_seconds,
        dropout_rate: dropout?.dropout_rate ?? 0,
        click_count: clicks?.count ?? 0,
        heat_score: computeHeatScore(reach_rate, avg_dwell_seconds, maxSectionAvgDwell),
      };
    });
  }

  return {
    lead: {
      id: leadRow.id,
      name: leadRow.name,
      phone: leadRow.phone,
      entry_page: leadRow.entry_page,
      last_section_name: leadRow.last_section_name,
      last_section_label: leadRow.last_section_label,
      max_scroll_depth: leadRow.max_scroll_depth,
    },
    landing_key: landingKey,
    session_ids: sessionIds,
    event_count: events.length,
    report,
  };
}
