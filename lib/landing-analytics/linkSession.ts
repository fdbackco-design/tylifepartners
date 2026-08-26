import { getSupabaseAdmin } from "@/lib/supabase";

export type LeadTable = "leads" | "tylife_b2b";

/**
 * 상담 신청 성공 시 session_id ↔ 고객 연결
 * - landing_lead_sessions upsert
 * - 해당 session 이벤트에 lead_table/lead_id 백필
 */
export async function linkLandingSessionToLead(opts: {
  leadTable: LeadTable;
  leadId: string;
  sessionId: string | null | undefined;
  visitorId?: string | null;
  landingKey?: string | null;
  pageUrl?: string | null;
}): Promise<void> {
  const sessionId = opts.sessionId?.trim();
  if (!sessionId || sessionId.length < 32) return;

  const supabase = getSupabaseAdmin();

  const { error: linkErr } = await supabase.from("landing_lead_sessions").upsert(
    {
      lead_table: opts.leadTable,
      lead_id: opts.leadId,
      session_id: sessionId,
      visitor_id: opts.visitorId ?? null,
      landing_key: opts.landingKey ?? null,
      page_url: opts.pageUrl ?? null,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "lead_table,lead_id,session_id" }
  );

  if (linkErr) {
    // 마이그레이션 전 환경에서는 조용히 스킵
    if (!/landing_lead_sessions|schema cache|column/i.test(linkErr.message)) {
      console.warn("[landing] link session failed:", linkErr.message);
    }
    return;
  }

  const { error: updErr } = await supabase
    .from("landing_events")
    .update({
      lead_table: opts.leadTable,
      lead_id: opts.leadId,
      visitor_id: opts.visitorId ?? undefined,
    })
    .eq("session_id", sessionId)
    .is("lead_id", null);

  if (updErr && !/lead_id|visitor_id|schema cache|column/i.test(updErr.message)) {
    console.warn("[landing] backfill events lead_id:", updErr.message);
  }

  const { error: submitEvtErr } = await supabase.from("landing_events").insert({
    landing_key: opts.landingKey || "unknown",
    session_id: sessionId,
    visitor_id: opts.visitorId ?? null,
    event_type: "lead_submit",
    event_key: "lead_submit",
    page_url: opts.pageUrl ?? null,
    lead_table: opts.leadTable,
    lead_id: opts.leadId,
    // 서버 삽입 이벤트는 디바이스/깊이 없음 — 집계 시 클라이언트 이벤트·리드 스냅샷으로 보강
  });
  if (submitEvtErr && !/duplicate|unique/i.test(submitEvtErr.message)) {
    console.warn("[landing] lead_submit event:", submitEvtErr.message);
  }
}
