import { getSupabaseAdmin } from "@/lib/supabase";
import type { LeadTable } from "@/lib/landing-analytics/linkSession";
import { formatDurationSeconds } from "@/lib/landing-analytics/formatDuration";

export type LeadBehaviorSessionSummary = {
  session_id: string;
  visitor_id: string | null;
  landing_key: string | null;
  page_url: string | null;
  linked_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  max_scroll_depth: number;
  duration_seconds: number;
  duration_label: string;
  section_dwells: { name: string; label: string; seconds: number }[];
  sections_viewed: { name: string; label: string }[];
  cta_clicks: { at: string; section_label: string | null; y_ratio: number | null }[];
  lead_submit_at: string | null;
  /** 0~100 구간 도달 여부 (시각화용) */
  scroll_markers: number[];
  /** y_ratio 샘플 (0~1) — 페이지 위 위치 표시 */
  scroll_positions: { y_ratio: number; at: string; depth: number | null }[];
};

export type LeadBehaviorReport = {
  lead_table: LeadTable;
  lead_id: string;
  sessions: LeadBehaviorSessionSummary[];
};

type EventRow = {
  session_id: string;
  visitor_id: string | null;
  event_type: string;
  landing_key: string | null;
  page_url: string | null;
  section_name: string | null;
  section_label: string | null;
  depth: number | null;
  max_depth: number | null;
  duration_seconds: number | null;
  y_ratio: number | null;
  created_at: string;
};

function summarizeSession(
  sessionId: string,
  events: EventRow[],
  linkMeta?: { visitor_id: string | null; landing_key: string | null; page_url: string | null; linked_at: string | null }
): LeadBehaviorSessionSummary {
  let maxDepth = 0;
  let duration = 0;
  let started: string | null = null;
  let ended: string | null = null;
  let pageUrl: string | null = linkMeta?.page_url ?? null;
  let landingKey: string | null = linkMeta?.landing_key ?? null;
  let visitorId: string | null = linkMeta?.visitor_id ?? null;
  let leadSubmitAt: string | null = null;

  const dwellMap = new Map<string, { name: string; label: string; seconds: number }>();
  const viewedMap = new Map<string, { name: string; label: string }>();
  const ctaClicks: LeadBehaviorSessionSummary["cta_clicks"] = [];
  const markers = new Set<number>();
  const scrollPositions: LeadBehaviorSessionSummary["scroll_positions"] = [];

  for (const ev of events) {
    if (!started || ev.created_at < started) started = ev.created_at;
    if (!ended || ev.created_at > ended) ended = ev.created_at;
    if (ev.visitor_id) visitorId = ev.visitor_id;
    if (ev.landing_key) landingKey = ev.landing_key;
    if (ev.page_url) pageUrl = ev.page_url;
    if (ev.max_depth != null) maxDepth = Math.max(maxDepth, ev.max_depth);
    if (ev.depth != null && (ev.event_type === "scroll_depth" || ev.event_type === "scroll_sample")) {
      markers.add(Math.round(ev.depth));
      maxDepth = Math.max(maxDepth, ev.depth);
    }
    // heartbeat / leave 기반 체류초 (section_dwell은 아래 합산)
    if (
      ev.duration_seconds != null &&
      (ev.event_type === "heartbeat" || ev.event_type === "leave")
    ) {
      duration = Math.max(duration, ev.duration_seconds);
    }

    if (ev.event_type === "section_dwell" && ev.section_name) {
      const prev = dwellMap.get(ev.section_name);
      const sec = ev.duration_seconds ?? 0;
      dwellMap.set(ev.section_name, {
        name: ev.section_name,
        label: ev.section_label || ev.section_name,
        seconds: (prev?.seconds ?? 0) + sec,
      });
      viewedMap.set(ev.section_name, {
        name: ev.section_name,
        label: ev.section_label || ev.section_name,
      });
    }

    if (ev.event_type === "cta_click") {
      ctaClicks.push({
        at: ev.created_at,
        section_label: ev.section_label,
        y_ratio: ev.y_ratio,
      });
    }

    if (ev.event_type === "lead_submit") {
      leadSubmitAt = ev.created_at;
    }

    if (
      (ev.event_type === "scroll_sample" || ev.event_type === "scroll_depth" || ev.event_type === "click" || ev.event_type === "cta_click") &&
      ev.y_ratio != null
    ) {
      scrollPositions.push({
        y_ratio: ev.y_ratio,
        at: ev.created_at,
        depth: ev.max_depth ?? ev.depth,
      });
    } else if (ev.event_type === "scroll_sample" || ev.event_type === "scroll_depth") {
      const d = ev.max_depth ?? ev.depth;
      if (d != null) {
        scrollPositions.push({
          y_ratio: Math.min(1, Math.max(0, d / 100)),
          at: ev.created_at,
          depth: d,
        });
      }
    }
  }

  markers.add(Math.round(maxDepth));

  // leave/heartbeat가 없으면 이벤트 시각 차로 체류 추정
  if (duration <= 0 && started && ended) {
    const ms = new Date(ended).getTime() - new Date(started).getTime();
    if (Number.isFinite(ms) && ms > 0) duration = Math.max(1, Math.round(ms / 1000));
  }

  // page_url이 경로만 있으면 landing_key 대신 표시용으로 유지
  let displayPage = landingKey;
  if (pageUrl) {
    try {
      const u = pageUrl.startsWith("http") ? new URL(pageUrl) : null;
      displayPage = u ? u.pathname : pageUrl;
    } catch {
      displayPage = pageUrl;
    }
  }

  return {
    session_id: sessionId,
    visitor_id: visitorId,
    landing_key: landingKey || displayPage,
    page_url: pageUrl,
    linked_at: linkMeta?.linked_at ?? null,
    started_at: started,
    ended_at: ended,
    max_scroll_depth: Math.round(maxDepth * 10) / 10,
    duration_seconds: duration,
    duration_label: formatDurationSeconds(duration),
    section_dwells: Array.from(dwellMap.values()).sort((a, b) => b.seconds - a.seconds),
    sections_viewed: Array.from(viewedMap.values()),
    cta_clicks: ctaClicks.sort((a, b) => (a.at < b.at ? -1 : 1)),
    lead_submit_at: leadSubmitAt,
    scroll_markers: Array.from(markers).filter((n) => n > 0).sort((a, b) => a - b),
    scroll_positions: scrollPositions.sort((a, b) => (a.at < b.at ? -1 : 1)).slice(0, 40),
  };
}

export async function loadLeadBehavior(
  leadTable: LeadTable,
  leadId: string
): Promise<LeadBehaviorReport> {
  const supabase = getSupabaseAdmin();

  const { data: links } = await supabase
    .from("landing_lead_sessions")
    .select("session_id, visitor_id, landing_key, page_url, linked_at")
    .eq("lead_table", leadTable)
    .eq("lead_id", leadId)
    .order("linked_at", { ascending: false });

  const sessionIds = new Set<string>((links ?? []).map((l) => l.session_id));

  // 레거시: 리드 스냅샷 session_id만 있는 경우
  const { data: leadRow } = await supabase
    .from(leadTable)
    .select("analytics_session_id, analytics_visitor_id, entry_page, max_scroll_depth")
    .eq("id", leadId)
    .maybeSingle();

  const legacySession = (leadRow as { analytics_session_id?: string | null } | null)?.analytics_session_id;
  if (legacySession) sessionIds.add(legacySession);

  // 이벤트로도 연결된 세션
  const { data: linkedEvents } = await supabase
    .from("landing_events")
    .select("session_id")
    .eq("lead_table", leadTable)
    .eq("lead_id", leadId)
    .limit(500);
  for (const row of linkedEvents ?? []) {
    if (row.session_id) sessionIds.add(row.session_id);
  }

  const ids = Array.from(sessionIds);
  if (!ids.length) {
    return { lead_table: leadTable, lead_id: leadId, sessions: [] };
  }

  const { data: events, error } = await supabase
    .from("landing_events")
    .select(
      "session_id, visitor_id, event_type, landing_key, page_url, section_name, section_label, depth, max_depth, duration_seconds, y_ratio, created_at"
    )
    .in("session_id", ids)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) {
    console.warn("[landing] loadLeadBehavior events:", error.message);
  }

  const bySession = new Map<string, EventRow[]>();
  for (const ev of (events ?? []) as EventRow[]) {
    const list = bySession.get(ev.session_id) ?? [];
    list.push(ev);
    bySession.set(ev.session_id, list);
  }

  const linkBySession = new Map(
    (links ?? []).map((l) => [
      l.session_id,
      {
        visitor_id: l.visitor_id as string | null,
        landing_key: l.landing_key as string | null,
        page_url: l.page_url as string | null,
        linked_at: l.linked_at as string | null,
      },
    ])
  );

  if (legacySession && !linkBySession.has(legacySession)) {
    linkBySession.set(legacySession, {
      visitor_id: (leadRow as { analytics_visitor_id?: string | null })?.analytics_visitor_id ?? null,
      landing_key: (leadRow as { entry_page?: string | null })?.entry_page ?? null,
      page_url: null,
      linked_at: null,
    });
  }

  const sessions = ids
    .map((id) => summarizeSession(id, bySession.get(id) ?? [], linkBySession.get(id)))
    .sort((a, b) => {
      const ta = a.started_at || a.linked_at || "";
      const tb = b.started_at || b.linked_at || "";
      return ta < tb ? 1 : -1;
    });

  // 이벤트가 전혀 없고 리드 스냅샷만 있는 경우 placeholder
  if (sessions.length === 1 && sessions[0].scroll_markers.length === 0 && leadRow) {
    const depth = Number((leadRow as { max_scroll_depth?: number | null }).max_scroll_depth ?? 0);
    if (depth > 0) {
      sessions[0].max_scroll_depth = depth;
      sessions[0].scroll_markers = [Math.round(depth)];
      sessions[0].scroll_positions = [{ y_ratio: depth / 100, at: sessions[0].linked_at || new Date().toISOString(), depth }];
    }
  }

  return { lead_table: leadTable, lead_id: leadId, sessions };
}
