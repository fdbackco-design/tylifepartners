import { aggregateLandingAnalytics, type LandingAnalyticsReport } from "@/lib/landing-analytics/aggregate";
import type { LandingEventAggregateRow } from "@/lib/landing-analytics/eventRow";
import { landingKeyFromEntryPage } from "@/lib/landing-analytics/sections";
import type { LeadTable } from "@/lib/landing-analytics/linkSession";
import { getManagedLandingSectionsByKey } from "@/lib/managedLandings/store";
import { getSupabaseAdmin } from "@/lib/supabase";

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

async function resolveLeadSessionIds(
  leadTable: LeadTable,
  leadId: string,
  analyticsSessionId: string | null
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

  return Array.from(ids);
}

function pickLandingKey(opts: {
  entryPage: string | null;
  events: Array<{ landing_key?: string | null }>;
  linkLandingKeys: string[];
}): string {
  const fromEntry = landingKeyFromEntryPage(opts.entryPage);
  if (fromEntry) return fromEntry;

  for (const k of opts.linkLandingKeys) {
    if (k && !k.startsWith("/")) return k;
    const mapped = landingKeyFromEntryPage(k);
    if (mapped) return mapped;
  }

  const counts = new Map<string, number>();
  for (const ev of opts.events) {
    const k = ev.landing_key;
    if (!k) continue;
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

/** 상담 신청 고객 세션만으로 기존 히트맵 리포트와 동일 형태의 집계 생성 */
export async function loadLeadHeatmapReport(
  leadTable: LeadTable,
  leadId: string
): Promise<LeadHeatmapResult | null> {
  const supabase = getSupabaseAdmin();
  const { data: lead, error } = await supabase
    .from(leadTable)
    .select(
      "id, name, phone, entry_page, analytics_session_id, last_section_name, last_section_label, max_scroll_depth"
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
    last_section_name: string | null;
    last_section_label: string | null;
    max_scroll_depth: number | null;
  };

  const sessionIds = await resolveLeadSessionIds(
    leadTable,
    leadId,
    leadRow.analytics_session_id
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
      .select(
        "session_id, event_type, depth, max_depth, duration_seconds, section_name, section_label, y_ratio, device_type, landing_key"
      )
      .in("session_id", sessionIds)
      .order("created_at", { ascending: true })
      .limit(5000);
    if (evErr) {
      console.warn("[landing] loadLeadHeatmapReport events:", evErr.message);
    }
    events = (data ?? []) as LandingEventAggregateRow[];
  }

  const landingKey = pickLandingKey({
    entryPage: leadRow.entry_page,
    events: events as Array<{ landing_key?: string | null }>,
    linkLandingKeys: (links ?? []).map((l) => String(l.landing_key ?? "")).filter(Boolean),
  });

  const managedSections = await getManagedLandingSectionsByKey(landingKey);
  const report = aggregateLandingAnalytics(landingKey, events, managedSections);

  // 단일 고객: 신청 시 구간은 리드 스냅샷 1건으로 표시
  if (leadRow.last_section_name) {
    report.section_dropout = report.section_dropout.map((row) => ({
      ...row,
      submission_count: row.name === leadRow.last_section_name ? 1 : 0,
    }));
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
