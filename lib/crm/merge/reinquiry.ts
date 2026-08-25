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
  meta_ad_id?: string | null;
  meta_adset_id?: string | null;
  meta_campaign_id?: string | null;
  receivedAtIso: string;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = getSupabaseAdmin();
  const digits = normalizeLeadPhone(opts.phone);

  const { data: cur } = await supabase
    .from(opts.table)
    .select(
      "memo, created_at, name, phone, source, entry_page, utm_source, utm_medium, utm_campaign, utm_content, utm_term"
    )
    .eq("id", opts.leadId)
    .maybeSingle();

  if (!cur) return { ok: false, message: "리드를 찾을 수 없습니다." };

  const prev = cur as {
    memo?: string | null;
    created_at?: string;
    name?: string;
    phone?: string;
    source?: string | null;
    entry_page?: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
  };

  const insertInbound = async (row: {
    received_at: string;
    name: string;
    phone: string;
    source?: string | null;
    entry_page?: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
  }) => {
    const { error } = await supabase.from("lead_inbound_logs").insert({
      lead_table: opts.table,
      lead_id: opts.leadId,
      source_lead_id: null,
      received_at: row.received_at,
      name: row.name,
      phone: row.phone,
      normalized_phone: digits,
      source: row.source ?? null,
      entry_page: row.entry_page ?? null,
      utm_source: row.utm_source ?? null,
      utm_medium: row.utm_medium ?? null,
      utm_campaign: row.utm_campaign ?? null,
      utm_content: row.utm_content ?? null,
      utm_term: row.utm_term ?? null,
    });
    if (error && !/lead_inbound_logs|schema cache/i.test(error.message)) {
      console.warn("attachInboundToExistingLead inbound:", error.message);
    }
  };

  // 최초 재유입이면 기존 신청 시각을 유입 이력에 먼저 보존
  const { count: inboundCount } = await supabase
    .from("lead_inbound_logs")
    .select("id", { count: "exact", head: true })
    .eq("lead_table", opts.table)
    .eq("lead_id", opts.leadId);

  if ((inboundCount ?? 0) === 0 && prev.created_at) {
    await insertInbound({
      received_at: prev.created_at,
      name: prev.name || opts.name,
      phone: prev.phone || opts.phone,
      source: prev.source,
      entry_page: prev.entry_page,
      utm_source: prev.utm_source,
      utm_medium: prev.utm_medium,
      utm_campaign: prev.utm_campaign,
      utm_content: prev.utm_content,
      utm_term: prev.utm_term,
    });
  }

  await insertInbound({
    received_at: opts.receivedAtIso,
    name: opts.name,
    phone: opts.phone,
    source: opts.source,
    entry_page: opts.entry_page,
    utm_source: opts.utm_source,
    utm_medium: opts.utm_medium,
    utm_campaign: opts.utm_campaign,
    utm_content: opts.utm_content,
    utm_term: opts.utm_term,
  });

  const stamp = new Date(opts.receivedAtIso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const prevMemo = String(prev.memo ?? "").trim();
  const note = `[재유입 · ${stamp}]\nUTM: ${opts.utm_source ?? "-"} / ${opts.utm_campaign ?? "-"} / ${opts.entry_page ?? "-"}`;
  const nextMemo = prevMemo ? `${prevMemo}\n\n${note}` : note;

  // 목록 신청시간·정렬이 최신 유입 기준으로 올라가도록 created_at 갱신
  const { error } = await supabase
    .from(opts.table)
    .update({
      utm_source: opts.utm_source ?? null,
      utm_medium: opts.utm_medium ?? null,
      utm_campaign: opts.utm_campaign ?? null,
      utm_content: opts.utm_content ?? null,
      utm_term: opts.utm_term ?? null,
      meta_ad_id: opts.meta_ad_id ?? null,
      meta_adset_id: opts.meta_adset_id ?? null,
      meta_campaign_id: opts.meta_campaign_id ?? null,
      entry_page: opts.entry_page ?? null,
      source: opts.source ?? undefined,
      memo: nextMemo,
      normalized_phone: digits,
      created_at: opts.receivedAtIso,
    })
    .eq("id", opts.leadId);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
