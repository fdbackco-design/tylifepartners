import { DEFAULT_CONSENT_VERSION } from "@/lib/crm/consentConstants";
import type { LeadCategory } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export { DEFAULT_CONSENT_VERSION } from "@/lib/crm/consentConstants";

export type LeadConsentType = "feedlife" | "tylife_b2b";

export type LeadConsentRow = {
  id: string;
  lead_id: string;
  lead_type: LeadConsentType;
  privacy_required: boolean;
  custom_info_consent: boolean;
  marketing_consent: boolean;
  ad_phone_consent: boolean;
  ad_sms_consent: boolean;
  ad_kakao_consent: boolean;
  ad_email_consent: boolean;
  consent_version: string;
  consent_source: string | null;
  consented_at: string;
  withdrawn_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

/** CRM 표시·API 응답용 최신 동의 요약 */
export type LeadConsentSummary = {
  privacy_required: boolean;
  custom_info_consent: boolean;
  marketing_consent: boolean;
  ad_phone_consent: boolean;
  ad_sms_consent: boolean;
  ad_kakao_consent: boolean;
  ad_email_consent: boolean;
  consent_version: string | null;
  consent_source: string | null;
  consented_at: string | null;
  withdrawn_at: string | null;
  /** withdrawn_at IS NULL 이고 최신 이력이 있음 */
  is_active: boolean;
  /** TM 대상: marketing + 전화광고 동의 + 미철회 */
  tm_eligible: boolean;
};

export type LeadConsentInput = {
  privacy_required?: boolean;
  custom_info_consent?: boolean;
  marketing_consent?: boolean;
  ad_phone_consent?: boolean;
  ad_sms_consent?: boolean;
  ad_kakao_consent?: boolean;
  ad_email_consent?: boolean;
  consent_version?: string;
  consent_source?: string | null;
  consented_at?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
};

function asBool(v: unknown, fallback = false): boolean {
  if (v === true || v === 1 || v === "1" || v === "true" || v === "yes" || v === "Y") return true;
  if (v === false || v === 0 || v === "0" || v === "false" || v === "no" || v === "N") return false;
  return fallback;
}

export function leadTypeForCategory(category: LeadCategory): LeadConsentType {
  return category === "candidates" ? "tylife_b2b" : "feedlife";
}

export function leadTypeForTable(table: "leads" | "tylife_b2b"): LeadConsentType {
  return table === "tylife_b2b" ? "tylife_b2b" : "feedlife";
}

/**
 * 랜딩/외부 API body → 동의 입력.
 * 레거시 marketing_consent(1/null)만 와도 동작. 선택 동의 false여도 신청 저장은 허용.
 */
export function parseConsentFromBody(
  body: Record<string, unknown>,
  opts?: { defaultSource?: string | null }
): LeadConsentInput {
  const legacyMarketing =
    body.marketing_consent === 1 ||
    body.marketing_consent === "1" ||
    body.marketing_consent === true ||
    body.marketing_consent === "true";

  const hasDetailed =
    body.privacy_required != null ||
    body.custom_info_consent != null ||
    body.ad_phone_consent != null ||
    body.ad_sms_consent != null ||
    body.ad_kakao_consent != null ||
    body.ad_email_consent != null;

  const marketing = body.marketing_consent != null ? asBool(body.marketing_consent) : legacyMarketing;

  return {
    privacy_required: body.privacy_required != null ? asBool(body.privacy_required, true) : true,
    custom_info_consent: asBool(body.custom_info_consent, false),
    marketing_consent: marketing,
    // 상세 필드 없으면 레거시 마케팅 동의 = 전 채널 동의로 간주 (기존 약관 문구 호환)
    ad_phone_consent: hasDetailed ? asBool(body.ad_phone_consent) : marketing,
    ad_sms_consent: hasDetailed ? asBool(body.ad_sms_consent) : marketing,
    ad_kakao_consent: hasDetailed ? asBool(body.ad_kakao_consent) : marketing,
    ad_email_consent: hasDetailed ? asBool(body.ad_email_consent) : marketing,
    consent_version: String(body.consent_version ?? DEFAULT_CONSENT_VERSION).trim() || DEFAULT_CONSENT_VERSION,
    consent_source:
      body.consent_source != null
        ? String(body.consent_source).trim() || null
        : opts?.defaultSource ?? null,
  };
}

/** Meta Lead Ads 등 마케팅 동의로 유입된 건 — TM 대상 가능하도록 전화 광고 동의 포함 */
export function metaLeadConsentInput(source = "meta_lead_ads"): LeadConsentInput {
  return {
    privacy_required: true,
    custom_info_consent: false,
    marketing_consent: true,
    ad_phone_consent: true,
    ad_sms_consent: true,
    ad_kakao_consent: true,
    ad_email_consent: true,
    consent_version: DEFAULT_CONSENT_VERSION,
    consent_source: source,
  };
}

/** 레거시 leads.marketing_consent SMALLINT 동기화 값 */
export function legacyMarketingConsentFlag(input: LeadConsentInput): 1 | null {
  return input.marketing_consent ? 1 : null;
}

export function toConsentSummary(row: LeadConsentRow | null | undefined): LeadConsentSummary | null {
  if (!row) return null;
  const active = !row.withdrawn_at;
  return {
    privacy_required: Boolean(row.privacy_required),
    custom_info_consent: Boolean(row.custom_info_consent),
    marketing_consent: Boolean(row.marketing_consent),
    ad_phone_consent: Boolean(row.ad_phone_consent),
    ad_sms_consent: Boolean(row.ad_sms_consent),
    ad_kakao_consent: Boolean(row.ad_kakao_consent),
    ad_email_consent: Boolean(row.ad_email_consent),
    consent_version: row.consent_version ?? null,
    consent_source: row.consent_source ?? null,
    consented_at: row.consented_at ?? null,
    withdrawn_at: row.withdrawn_at ?? null,
    is_active: active,
    tm_eligible: active && Boolean(row.marketing_consent) && Boolean(row.ad_phone_consent),
  };
}

function mapRow(r: Record<string, unknown>): LeadConsentRow {
  return {
    id: String(r.id),
    lead_id: String(r.lead_id),
    lead_type: r.lead_type === "tylife_b2b" ? "tylife_b2b" : "feedlife",
    privacy_required: Boolean(r.privacy_required),
    custom_info_consent: Boolean(r.custom_info_consent),
    marketing_consent: Boolean(r.marketing_consent),
    ad_phone_consent: Boolean(r.ad_phone_consent),
    ad_sms_consent: Boolean(r.ad_sms_consent),
    ad_kakao_consent: Boolean(r.ad_kakao_consent),
    ad_email_consent: Boolean(r.ad_email_consent),
    consent_version: String(r.consent_version ?? DEFAULT_CONSENT_VERSION),
    consent_source: r.consent_source != null ? String(r.consent_source) : null,
    consented_at: String(r.consented_at ?? ""),
    withdrawn_at: r.withdrawn_at != null ? String(r.withdrawn_at) : null,
    ip_address: r.ip_address != null ? String(r.ip_address) : null,
    user_agent: r.user_agent != null ? String(r.user_agent) : null,
    created_at: String(r.created_at ?? ""),
  };
}

/** append-only 동의 이력 추가. 실패해도 예외를 밖으로 던지지 않으려면 호출부에서 catch */
export async function insertLeadConsent(opts: {
  leadId: string;
  leadType: LeadConsentType;
  consent: LeadConsentInput;
  withdrawnAt?: string | null;
}): Promise<LeadConsentRow> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const payload = {
    lead_id: opts.leadId,
    lead_type: opts.leadType,
    privacy_required: opts.consent.privacy_required !== false,
    custom_info_consent: Boolean(opts.consent.custom_info_consent),
    marketing_consent: Boolean(opts.consent.marketing_consent),
    ad_phone_consent: Boolean(opts.consent.ad_phone_consent),
    ad_sms_consent: Boolean(opts.consent.ad_sms_consent),
    ad_kakao_consent: Boolean(opts.consent.ad_kakao_consent),
    ad_email_consent: Boolean(opts.consent.ad_email_consent),
    consent_version: String(opts.consent.consent_version || DEFAULT_CONSENT_VERSION).trim() || DEFAULT_CONSENT_VERSION,
    consent_source: opts.consent.consent_source ?? null,
    consented_at: opts.consent.consented_at || nowIso,
    withdrawn_at: opts.withdrawnAt ?? null,
    ip_address: opts.consent.ip_address ?? null,
    user_agent: opts.consent.user_agent ?? null,
  };

  const { data, error } = await supabase.from("lead_consents").insert(payload).select("*").single();
  if (error || !data) throw new Error(error?.message || "동의 이력 저장 실패");
  return mapRow(data as Record<string, unknown>);
}

export async function insertLeadConsentSafe(
  opts: Parameters<typeof insertLeadConsent>[0]
): Promise<LeadConsentRow | null> {
  try {
    return await insertLeadConsent(opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/lead_consents|schema cache|does not exist/i.test(msg)) {
      console.warn("[leadConsents] table missing — skip:", msg);
      return null;
    }
    console.warn("[leadConsents] insert failed:", msg);
    return null;
  }
}

/** 철회: 기존 row 수정 없이 철회 이력 row 추가 */
export async function withdrawLeadConsent(opts: {
  leadId: string;
  leadType: LeadConsentType;
  consentSource?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<LeadConsentRow> {
  const latest = await getLatestLeadConsent(opts.leadId, opts.leadType);
  const base: LeadConsentInput = latest
    ? {
        privacy_required: latest.privacy_required,
        custom_info_consent: latest.custom_info_consent,
        marketing_consent: latest.marketing_consent,
        ad_phone_consent: latest.ad_phone_consent,
        ad_sms_consent: latest.ad_sms_consent,
        ad_kakao_consent: latest.ad_kakao_consent,
        ad_email_consent: latest.ad_email_consent,
        consent_version: latest.consent_version,
        consent_source: opts.consentSource ?? latest.consent_source ?? "crm_withdraw",
        ip_address: opts.ipAddress ?? null,
        user_agent: opts.userAgent ?? null,
      }
    : {
        privacy_required: true,
        marketing_consent: false,
        consent_source: opts.consentSource ?? "crm_withdraw",
        ip_address: opts.ipAddress ?? null,
        user_agent: opts.userAgent ?? null,
      };

  return insertLeadConsent({
    leadId: opts.leadId,
    leadType: opts.leadType,
    consent: base,
    withdrawnAt: new Date().toISOString(),
  });
}

export async function getLatestLeadConsent(
  leadId: string,
  leadType: LeadConsentType
): Promise<LeadConsentRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lead_consents_latest")
    .select("*")
    .eq("lead_id", leadId)
    .eq("lead_type", leadType)
    .maybeSingle();
  if (error) {
    if (/lead_consents|schema cache|does not exist/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function attachLatestConsents(
  items: Array<{ id: string; type: "소비자" | "후보자" }>,
  mutate: (id: string, summary: LeadConsentSummary | null) => void
): Promise<void> {
  if (!items.length) return;
  const byType = new Map<LeadConsentType, string[]>();
  for (const it of items) {
    const t = it.type === "후보자" ? "tylife_b2b" : "feedlife";
    const list = byType.get(t) ?? [];
    list.push(it.id);
    byType.set(t, list);
  }

  const supabase = getSupabaseAdmin();
  for (const [leadType, ids] of Array.from(byType.entries())) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data, error } = await supabase
        .from("lead_consents_latest")
        .select("*")
        .eq("lead_type", leadType)
        .in("lead_id", chunk);
      if (error) {
        if (!/lead_consents|schema cache|does not exist/i.test(error.message)) {
          console.warn("[leadConsents] attach:", error.message);
        }
        return;
      }
      const map = new Map<string, LeadConsentSummary>();
      for (const row of data ?? []) {
        const mapped = mapRow(row as Record<string, unknown>);
        map.set(mapped.lead_id, toConsentSummary(mapped)!);
      }
      for (const id of chunk) mutate(id, map.get(id) ?? null);
    }
  }
}

/** TM 대상 lead_id 목록 (최신 이력이 마케팅+전화동의·미철회) */
export async function listTmEligibleLeadIds(
  leadType: LeadConsentType,
  limit = 5000
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lead_consents_latest")
    .select("lead_id")
    .eq("lead_type", leadType)
    .eq("marketing_consent", true)
    .eq("ad_phone_consent", true)
    .is("withdrawn_at", null)
    .limit(limit);
  if (error) {
    if (/lead_consents|schema cache|does not exist/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return Array.from(new Set((data ?? []).map((r) => String(r.lead_id)).filter(Boolean)));
}

export function clientMetaFromRequest(request: {
  headers: { get(name: string): string | null };
}): { ip_address: string | null; user_agent: string | null } {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]?.trim() : request.headers.get("x-real-ip");
  return {
    ip_address: ip || null,
    user_agent: request.headers.get("user-agent"),
  };
}
