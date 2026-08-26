import { aggregateLandingAnalytics, type LandingAnalyticsReport } from "@/lib/landing-analytics/aggregate";
import type { LandingEventAggregateRow } from "@/lib/landing-analytics/eventRow";
import { getLandingSections, landingKeyFromEntryPage } from "@/lib/landing-analytics/sections";
import type { LeadTable } from "@/lib/landing-analytics/linkSession";
import { getManagedLandingSectionsByKey } from "@/lib/managedLandings/store";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SCROLL_DEPTH_MILESTONES } from "@/lib/landing-analytics/types";

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

async function resolveLeadSessionIds(
  leadTable: LeadTable,
  leadId: string,
  analyticsSessionId: string | null,
  analyticsVisitorId: string | null
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const ids = new Set<string>();

  const { data: links } = await supabase
    .from("landing_lead_sessions")
    .select("session_id")
    .eq("lead_table", leadTable)
    .eq("lead_id", leadId);
  for (const row of links ?? []) {
    if (row.session_id) ids.add(row.session_id);
  }

  if (analyticsSessionId) ids.add(analyticsSessionId);

  const { data: linkedEvents } = await supabase
    .from("landing_events")
    .select("session_id")
    .eq("lead_table", leadTable)
    .eq("lead_id", leadId)
    .limit(500);
  for (const row of linkedEvents ?? []) {
    if (row.session_id) ids.add(row.session_id);
  }

  // 세션 연결이 비어 있거나 이벤트가 빈약할 때 visitor_id로 최근 세션 보강
  if (analyticsVisitorId) {
    const { data: visitorEvents } = await supabase
      .from("landing_events")
      .select("session_id")
      .eq("visitor_id", analyticsVisitorId)
      .order("created_at", { ascending: false })
      .limit(800);
    for (const row of visitorEvents ?? []) {
      if (row.session_id) ids.add(row.session_id);
    }
  }

  return Array.from(ids).filter(Boolean);
}

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

function eventsHaveScrollSignal(events: LandingEventAggregateRow[]): boolean {
  return events.some(
    (ev) =>
      (ev.max_depth != null && ev.max_depth > 0) ||
      ev.event_type === "scroll_depth" ||
      ev.event_type === "scroll_sample" ||
      ev.event_type === "section_dwell" ||
      ev.event_type === "click" ||
      ev.event_type === "cta_click"
  );
}

/** 리드 스냅샷으로 세션 max_depth / 도달 구간을 보강한 가상 이벤트 */
function synthesizeLeadSnapshotEvents(opts: {
  sessionId: string;
  maxScrollDepth: number | null;
  lastSectionName: string | null;
  landingKey: string;
  sections: { name: string; label: string; start: number; end: number }[];
}): LandingEventAggregateRow[] {
  const out: LandingEventAggregateRow[] = [];
  let depth = Number(opts.maxScrollDepth ?? 0);
  if (!Number.isFinite(depth) || depth < 0) depth = 0;

  if (opts.lastSectionName) {
    const idx = opts.sections.findIndex((s) => s.name === opts.lastSectionName);
    if (idx >= 0) {
      const sec = opts.sections[idx];
      // 해당 구간 중간까지는 본 것으로 간주
      const inferred = Math.max(depth, ((sec.start + sec.end) / 2) * 100);
      depth = Math.min(100, inferred);
    }
  }

  if (depth <= 0) return out;

  out.push({
    session_id: opts.sessionId,
    event_type: "scroll_sample",
    depth: Math.floor(depth / 5) * 5 || depth,
    max_depth: depth,
    y_ratio: depth / 100,
    landing_key: opts.landingKey,
    device_type: null,
  });

  for (const milestone of SCROLL_DEPTH_MILESTONES) {
    if (depth >= milestone) {
      out.push({
        session_id: opts.sessionId,
        event_type: "scroll_depth",
        depth: milestone,
        max_depth: depth,
        landing_key: opts.landingKey,
        device_type: null,
      });
    }
  }

  return out;
}

function applyLeadSubmissionCounts(
  report: LandingAnalyticsReport,
  lastSectionName: string | null
): void {
  if (!lastSectionName) return;
  report.section_dropout = report.section_dropout.map((row) => ({
    ...row,
    submission_count: row.name === lastSectionName ? 1 : 0,
  }));
}

/**
 * 단일 고객: 신청 구간까지는 도달한 것으로 보정 (이벤트 max_depth가 부족한 경우)
 */
function reconcileDropoutWithSubmissionSection(
  report: LandingAnalyticsReport,
  lastSectionName: string | null,
  maxScrollDepth: number | null
): void {
  if (!lastSectionName || report.section_dropout.length === 0) return;

  const submitIdx = report.section_dropout.findIndex((r) => r.name === lastSectionName);
  if (submitIdx < 0) return;

  const depth = Number(maxScrollDepth ?? 0);
  const depthRatio = Number.isFinite(depth) ? Math.min(1, Math.max(0, depth / 100)) : 0;

  // 이벤트 기반 도달이 신청 구간보다 얕으면 스냅샷 기준으로 보정
  const reachedSubmit = report.section_dropout[submitIdx]?.reached ?? 0;
  if (reachedSubmit > 0 && depthRatio > 0) return;

  report.section_dropout = report.section_dropout.map((row, index) => {
    if (index < submitIdx) {
      return {
        ...row,
        reached: Math.max(row.reached, 1),
        dropped: 0,
        dropout_rate: 0,
        next_section_reached: 1,
        next_section_reach_rate: 100,
      };
    }
    if (index === submitIdx) {
      return {
        ...row,
        reached: Math.max(row.reached, 1),
        dropped: 1,
        dropout_rate: 100,
        next_section_reached: 0,
        next_section_reach_rate: 0,
      };
    }
    return row;
  });
}

/** 상담 신청 고객 세션만으로 기존 히트맵 리포트와 동일 형태의 집계 생성 */
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

  let sessionIds = await resolveLeadSessionIds(
    leadTable,
    leadId,
    leadRow.analytics_session_id,
    leadRow.analytics_visitor_id
  );

  const { data: links } = await supabase
    .from("landing_lead_sessions")
    .select("landing_key")
    .eq("lead_table", leadTable)
    .eq("lead_id", leadId);

  let events: LandingEventAggregateRow[] = [];
  if (sessionIds.length) {
    const { data, error: evErr } = await supabase
      .from("landing_events")
      .select(EVENT_SELECT)
      .in("session_id", sessionIds)
      .order("created_at", { ascending: true })
      .limit(5000);
    if (evErr) {
      console.warn("[landing] loadLeadHeatmapReport events:", evErr.message);
    }
    events = (data ?? []) as LandingEventAggregateRow[];
  }

  // 연결된 세션에 스크롤 신호가 없으면 visitor 최근 세션만 남기고 재조회
  if (!eventsHaveScrollSignal(events) && leadRow.analytics_visitor_id) {
    const { data: visitorRows } = await supabase
      .from("landing_events")
      .select(EVENT_SELECT)
      .eq("visitor_id", leadRow.analytics_visitor_id)
      .order("created_at", { ascending: false })
      .limit(2000);
    const visitorEvents = (visitorRows ?? []) as LandingEventAggregateRow[];
    if (eventsHaveScrollSignal(visitorEvents)) {
      events = visitorEvents.slice().reverse();
      sessionIds = Array.from(new Set(events.map((e) => e.session_id).filter(Boolean)));
    }
  }

  const landingKey = pickLandingKey({
    entryPage: leadRow.entry_page,
    events: events as Array<{ landing_key?: string | null }>,
    linkLandingKeys: (links ?? []).map((l) => String(l.landing_key ?? "")).filter(Boolean),
  });

  const managedSections = await getManagedLandingSectionsByKey(landingKey);
  const sections = managedSections?.length
    ? managedSections
    : getLandingSections(landingKey);

  // 이벤트에 스크롤 신호가 없으면 리드 스냅샷으로 보강
  if (!eventsHaveScrollSignal(events)) {
    const fallbackSession =
      leadRow.analytics_session_id ||
      sessionIds[0] ||
      `lead-snapshot:${leadId}`;
    const synth = synthesizeLeadSnapshotEvents({
      sessionId: fallbackSession,
      maxScrollDepth: leadRow.max_scroll_depth,
      lastSectionName: leadRow.last_section_name,
      landingKey,
      sections,
    });
    if (synth.length) {
      events = [...events, ...synth];
      if (!sessionIds.includes(fallbackSession)) sessionIds = [...sessionIds, fallbackSession];
    }
  } else if (leadRow.max_scroll_depth != null && leadRow.max_scroll_depth > 0) {
    // 이벤트 max_depth가 스냅샷보다 낮으면 스냅샷 깊이 보강
    const maxEv = events.reduce((m, ev) => Math.max(m, Number(ev.max_depth ?? 0) || 0), 0);
    if (maxEv + 0.5 < leadRow.max_scroll_depth) {
      const sid = leadRow.analytics_session_id || sessionIds[0] || events[0]?.session_id;
      if (sid) {
        events = [
          ...events,
          ...synthesizeLeadSnapshotEvents({
            sessionId: sid,
            maxScrollDepth: leadRow.max_scroll_depth,
            lastSectionName: leadRow.last_section_name,
            landingKey,
            sections,
          }),
        ];
      }
    }
  }

  const report = aggregateLandingAnalytics(landingKey, events, managedSections);
  applyLeadSubmissionCounts(report, leadRow.last_section_name);
  reconcileDropoutWithSubmissionSection(
    report,
    leadRow.last_section_name,
    leadRow.max_scroll_depth
  );

  // 히트맵 도달률도 이탈표와 맞추기
  if (report.total_sessions > 0) {
    const dropoutByName = new Map(report.section_dropout.map((d) => [d.name, d]));
    report.section_heatmap = report.section_heatmap.map((row) => {
      const d = dropoutByName.get(row.name);
      const reach_rate =
        report.total_sessions > 0 ? ((d?.reached ?? 0) / report.total_sessions) * 100 : row.reach_rate;
      return {
        ...row,
        reach_rate,
        dropout_rate: d?.dropout_rate ?? row.dropout_rate,
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
