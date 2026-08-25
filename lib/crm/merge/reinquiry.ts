import { normalizeLeadName, normalizeLeadPhone, isValidNormalizedPhone } from "@/lib/crm/merge/logic";
import { getSupabaseAdmin } from "@/lib/supabase";

export type LeadTable = "leads" | "tylife_b2b";

export type ExistingLeadHit = {
  id: string;
  name: string;
  phone: string;
  memo: string | null;
  assignee_id: string | null;
};

/** 동일 정규화 전화의 활성 고객 조회 (최신 유입 우선) */
export async function findActiveLeadsByPhone(
  table: LeadTable,
  phoneDigits: string
): Promise<ExistingLeadHit[]> {
  if (!isValidNormalizedPhone(phoneDigits)) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(table)
    .select("id, name, phone, memo, assignee_id, created_at")
    .eq("normalized_phone", phoneDigits)
    .or("merge_status.eq.active,merge_status.is.null")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    // normalized_phone 컬럼 미적용 환경 폴백
    const { data: fallback } = await supabase
      .from(table)
      .select("id, name, phone, memo, assignee_id, created_at")
      .eq("phone", phoneDigits)
      .order("created_at", { ascending: false })
      .limit(20);
    return (fallback ?? []) as ExistingLeadHit[];
  }
  return (data ?? []) as ExistingLeadHit[];
}

export function pickSamePersonLead(
  hits: ExistingLeadHit[],
  incomingName: string
): ExistingLeadHit | null {
  const norm = normalizeLeadName(incomingName);
  const sameName = hits.find((h) => normalizeLeadName(h.name) === norm);
  return sameName ?? null;
}

export async function attachInboundToExistingLead(opts: {
  table: LeadTable;
  leadId: string;
  name: string;
  phone: string;
  source?: string | null;
  entry_page?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  receivedAtIso: string;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = getSupabaseAdmin();
  const digits = normalizeLeadPhone(opts.phone);
  const { error: inboundErr } = await supabase.from("lead_inbound_logs").insert({
    lead_table: opts.table,
    lead_id: opts.leadId,
    source_lead_id: null,
    received_at: opts.receivedAtIso,
    name: opts.name,
    phone: opts.phone,
    normalized_phone: digits,
    source: opts.source ?? null,
    entry_page: opts.entry_page ?? null,
    utm_source: opts.utm_source ?? null,
    utm_medium: opts.utm_medium ?? null,
    utm_campaign: opts.utm_campaign ?? null,
    utm_content: opts.utm_content ?? null,
    utm_term: opts.utm_term ?? null,
  });
  // 테이블 없으면 무시하고 본문 업데이트만
  if (inboundErr && !/lead_inbound_logs|schema cache/i.test(inboundErr.message)) {
    console.warn("attachInboundToExistingLead inbound:", inboundErr.message);
  }

  const stamp = new Date(opts.receivedAtIso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const { data: cur } = await supabase.from(opts.table).select("memo").eq("id", opts.leadId).maybeSingle();
  const prevMemo = String((cur as { memo?: string | null } | null)?.memo ?? "").trim();
  const note = `[재유입 · ${stamp}]\nUTM: ${opts.utm_source ?? "-"} / ${opts.utm_campaign ?? "-"} / ${opts.entry_page ?? "-"}`;
  const nextMemo = prevMemo ? `${prevMemo}\n\n${note}` : note;

  const { error } = await supabase
    .from(opts.table)
    .update({
      utm_source: opts.utm_source ?? null,
      utm_medium: opts.utm_medium ?? null,
      utm_campaign: opts.utm_campaign ?? null,
      utm_content: opts.utm_content ?? null,
      utm_term: opts.utm_term ?? null,
      entry_page: opts.entry_page ?? null,
      source: opts.source ?? undefined,
      memo: nextMemo,
      normalized_phone: digits,
    })
    .eq("id", opts.leadId);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
