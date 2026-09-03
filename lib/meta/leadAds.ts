import { createHmac, timingSafeEqual } from "node:crypto";
import { tryAutoAssignLead } from "@/lib/crm/assignment";
import { resolveRegionZone } from "@/lib/crm/regionZones";
import { getMetaAccessToken } from "@/lib/meta/ads";
import { isLeadSubmissionBlockedAsync, maskPhoneForLog, normalizePhoneDigits } from "@/lib/phoneBlacklist";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyAdminsNewLead } from "@/lib/webPush";

const GRAPH_VERSION = "v21.0";

export type MetaLeadFieldData = { name?: string; values?: string[] };

export type MetaGraphLead = {
  id: string;
  created_time?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
  field_data?: MetaLeadFieldData[];
};

export type ParsedMetaLeadFields = {
  name: string;
  phone: string;
  email: string | null;
  region: string | null;
};

export type MetaLeadgenWebhookValue = {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  adset_id?: string;
  campaign_id?: string;
  created_time?: number | string;
};

export type IngestMetaLeadResult =
  | { ok: true; created: boolean; leadId: string; skipped?: "blocked" }
  | { ok: false; message: string; status?: number; stage?: "graph" | "supabase" | "validate" };

function fieldMap(fieldData: MetaLeadFieldData[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of fieldData ?? []) {
    const key = String(f.name ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const val = Array.isArray(f.values) ? String(f.values[0] ?? "").trim() : "";
    if (key && val) map.set(key, val);
  }
  return map;
}

function pickField(map: Map<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = map.get(k);
    if (v) return v;
  }
  return "";
}

/** +82 / 82 시작 번호를 국내 0xx 형태로 정규화 */
export function normalizeMetaPhone(raw: string): string {
  let digits = normalizePhoneDigits(raw);
  if (digits.startsWith("82") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
}

/** Instant Form field_data → CRM 필드 */
export function parseMetaLeadFields(fieldData: MetaLeadFieldData[] | undefined): ParsedMetaLeadFields {
  const map = fieldMap(fieldData);
  const first = pickField(map, ["first_name", "이름", "성명_이름"]);
  const last = pickField(map, ["last_name", "성", "성명_성"]);
  const full = pickField(map, [
    "full_name",
    "fullname",
    "이름",
    "성함",
    "고객명",
    "성명",
  ]);
  let name = full || [last, first].filter(Boolean).join(" ").trim() || [first, last].filter(Boolean).join(" ").trim();
  name = name.replace(/\s+/g, " ").trim();

  const phone = normalizeMetaPhone(
    pickField(map, [
      "phone_number",
      "phone",
      "mobile",
      "mobile_phone",
      "연락처",
      "휴대폰",
      "핸드폰",
      "전화번호",
    ])
  );

  const email =
    pickField(map, ["email", "e-mail", "이메일", "메일"]) || null;

  const region =
    pickField(map, [
      "city",
      "state",
      "province",
      "region",
      "location",
      "사는_곳",
      "사는곳",
      "거주지역",
      "지역",
      "주소",
    ]) || null;

  return { name, phone, email: email || null, region };
}

export function getMetaWebhookVerifyToken(): string | null {
  const t = String(process.env.META_WEBHOOK_VERIFY_TOKEN ?? "").trim();
  return t || null;
}

export function getMetaAppSecret(): string | null {
  const t = String(process.env.META_APP_SECRET ?? "").trim();
  return t || null;
}

export type SignatureVerifyResult = {
  ok: boolean;
  reason?: "missing_header" | "bad_prefix" | "mismatch" | "skipped_no_secret";
};

/**
 * X-Hub-Signature-256 검증 — 반드시 Webhook 원본 raw body 문자열로 HMAC-SHA256.
 * JSON.parse 후 JSON.stringify 한 값으로 검증하면 안 된다.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): SignatureVerifyResult {
  const secret = getMetaAppSecret();
  if (!secret) {
    console.warn("[meta-leads][signature] META_APP_SECRET 미설정 — 서명 검증 생략", {
      rawBodyBytes: Buffer.byteLength(rawBody, "utf8"),
      hasHeader: Boolean(signatureHeader),
    });
    return { ok: true, reason: "skipped_no_secret" };
  }
  if (!signatureHeader) {
    console.error("[meta-leads][signature] X-Hub-Signature-256 헤더 없음", {
      rawBodyBytes: Buffer.byteLength(rawBody, "utf8"),
      hasAppSecret: true,
    });
    return { ok: false, reason: "missing_header" };
  }
  if (!signatureHeader.startsWith("sha256=")) {
    console.error("[meta-leads][signature] 헤더 prefix 오류", {
      headerPrefix: signatureHeader.slice(0, 16),
      rawBodyBytes: Buffer.byteLength(rawBody, "utf8"),
    });
    return { ok: false, reason: "bad_prefix" };
  }

  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const incomingHex = signatureHeader.slice("sha256=".length).trim().toLowerCase();
  try {
    const a = Buffer.from(expectedHex, "utf8");
    const b = Buffer.from(incomingHex, "utf8");
    const match = a.length === b.length && timingSafeEqual(a, b);
    if (!match) {
      console.error("[meta-leads][signature] HMAC mismatch", {
        rawBodyBytes: Buffer.byteLength(rawBody, "utf8"),
        expectedLen: expectedHex.length,
        incomingLen: incomingHex.length,
        // 토큰/시크릿/본문 전문은 절대 출력하지 않음
      });
      return { ok: false, reason: "mismatch" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[meta-leads][signature] compare error:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "mismatch" };
  }
}

function sanitizeGraphErrorBody(json: unknown): Record<string, unknown> {
  const err = (json as { error?: Record<string, unknown> })?.error;
  if (!err || typeof err !== "object") {
    return { hasErrorObject: false };
  }
  return {
    message: err.message != null ? String(err.message) : undefined,
    type: err.type != null ? String(err.type) : undefined,
    code: err.code != null ? err.code : undefined,
    error_subcode: err.error_subcode != null ? err.error_subcode : undefined,
    fbtrace_id: err.fbtrace_id != null ? String(err.fbtrace_id) : undefined,
  };
}

export async function fetchMetaLeadById(leadgenId: string): Promise<
  { ok: true; lead: MetaGraphLead } | { ok: false; status: number; message: string }
> {
  const token = getMetaAccessToken();
  const tokenLoaded = Boolean(token);
  console.info("[meta-leads][graph] token loaded:", {
    loaded: tokenLoaded,
    tokenChars: token ? token.length : 0,
    leadgenId,
  });
  if (!token) {
    console.error("[meta-leads][graph] META_ACCESS_TOKEN 미설정 — 서버 env 확인 필요");
    return { ok: false, status: 0, message: "META_ACCESS_TOKEN 미설정" };
  }

  const id = String(leadgenId).trim();
  if (!id) return { ok: false, status: 400, message: "leadgen_id 없음" };

  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(id)}`);
  url.searchParams.set(
    "fields",
    "id,created_time,ad_id,adset_id,campaign_id,form_id,field_data"
  );
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(json?.error?.message ?? res.statusText ?? "Meta Graph error");
    console.error("[meta-leads][graph] fetch failed:", {
      leadgenId: id,
      httpStatus: res.status,
      error: sanitizeGraphErrorBody(json),
    });
    return { ok: false, status: res.status, message: msg };
  }

  const lead = json as MetaGraphLead;
  console.info("[meta-leads][graph] fetch ok:", {
    leadgenId: id,
    httpStatus: res.status,
    form_id: lead.form_id ?? null,
    ad_id: lead.ad_id ?? null,
    adset_id: lead.adset_id ?? null,
    campaign_id: lead.campaign_id ?? null,
    fieldCount: Array.isArray(lead.field_data) ? lead.field_data.length : 0,
    fieldNames: Array.isArray(lead.field_data)
      ? lead.field_data.map((f) => f.name).filter(Boolean)
      : [],
  });
  return { ok: true, lead };
}

function parseMetaCreatedTime(raw: string | number | undefined | null): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function logSupabaseError(stage: string, error: { message?: string; details?: string; hint?: string; code?: string }, extra?: Record<string, unknown>) {
  console.error(`[meta-leads][supabase] ${stage}:`, {
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    code: error.code ?? null,
    ...extra,
  });
}

/**
 * Meta Instant Form 리드를 소비자 DB(leads)에 반영.
 * meta_lead_id 기준 중복 방지(재전송 UPSERT).
 */
export async function ingestMetaLeadFromWebhook(
  value: MetaLeadgenWebhookValue
): Promise<IngestMetaLeadResult> {
  const leadgenId = String(value.leadgen_id ?? "").trim();
  if (!leadgenId) {
    return { ok: false, message: "leadgen_id 없음", status: 400, stage: "validate" };
  }

  console.info("[meta-leads][ingest] start:", {
    leadgen_id: leadgenId,
    form_id: value.form_id ?? null,
    page_id: value.page_id ?? null,
    ad_id: value.ad_id ?? null,
  });

  const fetched = await fetchMetaLeadById(leadgenId);
  if (!fetched.ok) {
    return {
      ok: false,
      message: fetched.message,
      status: fetched.status || 502,
      stage: "graph",
    };
  }

  const graph = fetched.lead;
  const parsed = parseMetaLeadFields(graph.field_data);
  let name = parsed.name;
  if (!name || name.length < 2) name = "Meta리드";
  if (name.length > 40) name = name.slice(0, 40);

  const phone = parsed.phone;
  if (phone.length < 10 || phone.length > 11) {
    console.error("[meta-leads][validate] invalid phone:", {
      leadgenId,
      phoneMasked: phone ? maskPhoneForLog(phone) : "(empty)",
      fieldNames: graph.field_data?.map((f) => f.name),
    });
    return { ok: false, message: "유효한 전화번호가 없습니다.", status: 400, stage: "validate" };
  }

  if (await isLeadSubmissionBlockedAsync(phone)) {
    console.warn("[meta-leads][ingest] blocked phone skipped:", maskPhoneForLog(phone), leadgenId);
    return { ok: true, created: false, leadId: "", skipped: "blocked" };
  }

  const formId = String(graph.form_id ?? value.form_id ?? "").trim() || null;
  const adId = String(graph.ad_id ?? value.ad_id ?? "").trim() || null;
  const adsetId =
    String(graph.adset_id ?? value.adset_id ?? value.adgroup_id ?? "").trim() || null;
  const campaignId = String(graph.campaign_id ?? value.campaign_id ?? "").trim() || null;
  const metaCreated =
    parseMetaCreatedTime(graph.created_time) ||
    parseMetaCreatedTime(value.created_time) ||
    null;
  const regionRaw = parsed.region;
  const nowIso = new Date().toISOString();

  const supabase = getSupabaseAdmin();

  const { data: existing, error: findErr } = await supabase
    .from("leads")
    .select("id")
    .eq("meta_lead_id", leadgenId)
    .maybeSingle();

  if (findErr) {
    logSupabaseError("lookup by meta_lead_id", findErr, { leadgenId });
    // 컬럼 미적용(039 미실행)이면 insert도 실패하므로 여기서 중단해 원인을 명확히 함
    if (/meta_lead_id|schema cache|column/i.test(findErr.message)) {
      return {
        ok: false,
        message: `Supabase 스키마 오류(meta_lead_id): ${findErr.message}. 마이그레이션 039를 적용하세요.`,
        status: 500,
        stage: "supabase",
      };
    }
    return { ok: false, message: findErr.message, status: 500, stage: "supabase" };
  }

  if (existing?.id) {
    const { error: updErr } = await supabase
      .from("leads")
      .update({
        name,
        phone,
        normalized_phone: phone,
        email: parsed.email,
        meta_form_id: formId,
        meta_ad_id: adId,
        meta_adset_id: adsetId,
        meta_campaign_id: campaignId,
        meta_created_time: metaCreated,
        source: "meta",
        utm_source: "meta",
        utm_medium: "lead_ads",
        utm_content: adId,
        region: regionRaw,
        location: regionRaw,
        region_zone: resolveRegionZone(regionRaw),
      })
      .eq("id", existing.id);

    if (updErr) {
      logSupabaseError("update existing lead", updErr, { leadgenId, leadId: existing.id });
      return { ok: false, message: updErr.message, status: 500, stage: "supabase" };
    }
    console.info("[meta-leads][supabase] upsert update ok:", { leadgenId, leadId: existing.id });
    return { ok: true, created: false, leadId: String(existing.id) };
  }

  const insertRow: Record<string, unknown> = {
    name,
    phone,
    normalized_phone: phone,
    email: parsed.email,
    source: "meta",
    utm_source: "meta",
    utm_medium: "lead_ads",
    utm_campaign: campaignId,
    utm_content: adId,
    meta_lead_id: leadgenId,
    meta_form_id: formId,
    meta_ad_id: adId,
    meta_adset_id: adsetId,
    meta_campaign_id: campaignId,
    meta_created_time: metaCreated,
    entry_page: "/meta-lead-ads",
    region: regionRaw,
    location: regionRaw,
    region_zone: resolveRegionZone(regionRaw),
    status: "배정전",
    status_changed_at: nowIso,
    merge_status: "active",
    marketing_consent: 1,
  };
  if (metaCreated) insertRow.created_at = metaCreated;

  const { data: inserted, error: insErr } = await supabase
    .from("leads")
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr) {
    logSupabaseError("insert new lead", insErr, { leadgenId });
    // 동시 재전송으로 unique 충돌 시 재조회
    if (/duplicate|unique|meta_lead_id/i.test(insErr.message)) {
      const { data: again, error: againErr } = await supabase
        .from("leads")
        .select("id")
        .eq("meta_lead_id", leadgenId)
        .maybeSingle();
      if (againErr) logSupabaseError("re-lookup after unique conflict", againErr, { leadgenId });
      if (again?.id) {
        return { ok: true, created: false, leadId: String(again.id) };
      }
    }
    return { ok: false, message: insErr.message, status: 500, stage: "supabase" };
  }

  const leadId = String(inserted.id);
  console.info("[meta-leads][supabase] insert ok:", { leadgenId, leadId, phone: maskPhoneForLog(phone) });

  try {
    await tryAutoAssignLead({
      table: "leads",
      leadId,
      region: regionRaw,
      utmSource: "meta",
    });
  } catch (e) {
    console.warn("[meta-leads] auto-assign skipped:", e instanceof Error ? e.message : e);
  }

  try {
    await notifyAdminsNewLead({
      kind: "consumers",
      name,
      phone,
      leadId,
      region: regionRaw,
    });
  } catch (e) {
    console.warn("[meta-leads] push notify skipped:", e instanceof Error ? e.message : e);
  }

  return { ok: true, created: true, leadId };
}

/** Webhook entry에서 leadgen change value 목록 추출 */
export function extractLeadgenValues(body: unknown): MetaLeadgenWebhookValue[] {
  const out: MetaLeadgenWebhookValue[] = [];
  const root = body as { object?: string; entry?: unknown[] };
  if (!root || !Array.isArray(root.entry)) {
    console.warn("[meta-leads][parse] entry 배열 없음", {
      object: (root as { object?: string })?.object ?? null,
      bodyType: typeof body,
    });
    return out;
  }

  for (const entry of root.entry) {
    const pageIdFromEntry = String((entry as { id?: string })?.id ?? "").trim() || null;
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const ch of changes) {
      const c = ch as { field?: string; value?: MetaLeadgenWebhookValue };
      if (c.field !== "leadgen") {
        console.info("[meta-leads][parse] skip non-leadgen field:", c.field ?? null);
        continue;
      }
      const value = c.value ?? {};
      const leadgenId = String(value.leadgen_id ?? "").trim();
      if (!leadgenId) {
        console.warn("[meta-leads][parse] leadgen field without leadgen_id", {
          form_id: value.form_id ?? null,
          page_id: value.page_id ?? pageIdFromEntry,
        });
        continue;
      }
      const normalized: MetaLeadgenWebhookValue = {
        ...value,
        leadgen_id: leadgenId,
        form_id: value.form_id ?? undefined,
        page_id: value.page_id ?? pageIdFromEntry ?? undefined,
      };
      console.info("[meta-leads][parse] extracted leadgen:", {
        leadgen_id: normalized.leadgen_id,
        form_id: normalized.form_id ?? null,
        page_id: normalized.page_id ?? null,
        ad_id: normalized.ad_id ?? null,
        adgroup_id: normalized.adgroup_id ?? null,
      });
      out.push(normalized);
    }
  }
  return out;
}
