import { createHmac, timingSafeEqual } from "node:crypto";
import { tryAutoAssignLead } from "@/lib/crm/assignment";
import { mapMetaLeadJobRank } from "@/lib/crm/metaLeadCsv";
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
  rawName: string;
  nameIsTestDummy: boolean;
  phone: string;
  rawPhone: string;
  phoneIsTestDummy: boolean;
  email: string | null;
  region: string | null;
  available_time: string | null;
  age_group: string | null;
  job: string | null;
  job_rank: string | null;
};

const PHONE_FIELD_KEYS = [
  "phone_number",
  "phone",
  "전화번호",
  "휴대폰",
  "휴대전화",
  "mobile_phone",
  "mobile",
  "연락처",
  "핸드폰",
] as const;

const NAME_FIELD_KEYS = [
  "full_name",
  "fullname",
  "name",
  "이름",
  "성함",
  "고객명",
  "성명",
  "fname",
] as const;

/** Meta Lead Ads Testing Tool 더미값 (`<test lead: dummy data for …>`) */
export function isMetaTestDummyValue(raw: string): boolean {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  return /^<\s*test\s+lead\s*:/i.test(s) || /dummy\s+data\s+for/i.test(s);
}

/** 더미 전화용 합성 번호(leadgen_id 기반, 11자리) — 실번호와 충돌 최소화 */
export function syntheticTestPhoneFromLeadId(leadgenId: string): string {
  const digits = String(leadgenId).replace(/\D/g, "");
  const tail = `${digits.slice(-8)}00000000`.slice(0, 8);
  return `010${tail}`.slice(0, 11);
}

/** 숫자가 거의 없는 원본도 로그에 안전하게 남김 */
export function maskRawPhoneForLog(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "(empty)";
  if (isMetaTestDummyValue(s)) return "(meta-test-dummy)";
  const digits = normalizePhoneDigits(s);
  if (digits.length >= 7) return maskPhoneForLog(digits);
  return `(non-phone len=${s.length} digits=${digits.length})`;
}

function extractFieldRawValue(f: MetaLeadFieldData): string {
  const values = f.values as unknown;
  if (Array.isArray(values)) {
    const first = values[0];
    if (first == null) return "";
    return String(first).trim();
  }
  if (typeof values === "string" || typeof values === "number") {
    return String(values).trim();
  }
  const single = (f as { value?: unknown }).value;
  if (typeof single === "string" || typeof single === "number") {
    return String(single).trim();
  }
  return "";
}

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

function normalizeFieldKey(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function fieldMap(fieldData: MetaLeadFieldData[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of fieldData ?? []) {
    const key = normalizeFieldKey(String(f.name ?? ""));
    const val = extractFieldRawValue(f);
    if (key && val && !map.has(key)) map.set(key, val);
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
  const first = pickField(map, ["first_name", "성명_이름"]);
  const last = pickField(map, ["last_name", "성", "성명_성"]);
  const full = pickField(map, [...NAME_FIELD_KEYS]);
  let rawName =
    full || [last, first].filter(Boolean).join(" ").trim() || [first, last].filter(Boolean).join(" ").trim();
  rawName = rawName.replace(/\s+/g, " ").trim();
  const nameIsTestDummy = isMetaTestDummyValue(rawName);
  const name = nameIsTestDummy ? "" : rawName;

  const rawPhone = pickField(map, [...PHONE_FIELD_KEYS]);
  const phoneIsTestDummy = isMetaTestDummyValue(rawPhone);
  const phone = phoneIsTestDummy ? "" : normalizeMetaPhone(rawPhone);

  const emailRaw = pickField(map, ["email", "e-mail", "이메일", "메일"]);
  const email = emailRaw && !isMetaTestDummyValue(emailRaw) ? emailRaw : null;

  const regionRaw = pickField(map, [
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
  ]);
  const region = regionRaw && !isMetaTestDummyValue(regionRaw) ? regionRaw : null;

  const pickOptional = (keys: string[]) => {
    const v = pickField(map, keys);
    return v && !isMetaTestDummyValue(v) ? v : null;
  };

  const available_time = pickOptional(["상담가능시간", "available_time", "desired_time"]);
  const age_group = pickOptional(["연령대", "age_group", "age"]);
  const job = pickOptional(["직업", "job", "occupation"]);
  const jobRankRaw = pickOptional(["직급", "job_rank"]);
  const job_rank = jobRankRaw ? mapMetaLeadJobRank(jobRankRaw) ?? jobRankRaw.replace(/_/g, " ") : null;

  return {
    name,
    rawName,
    nameIsTestDummy,
    phone,
    rawPhone,
    phoneIsTestDummy,
    email: email || null,
    region,
    available_time,
    age_group,
    job,
    job_rank,
  };
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
 * Meta Instant Form 리드를 후보자 DB(tylife_b2b)에 반영.
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
    target: "tylife_b2b",
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
  if (parsed.nameIsTestDummy || !name || name.length < 2) {
    name = parsed.nameIsTestDummy ? "Meta테스트리드" : "Meta리드";
  }
  if (name.length > 40) name = name.slice(0, 40);

  let phone = parsed.phone;
  const phoneRawMasked = maskRawPhoneForLog(parsed.rawPhone);
  const phoneNormMasked = phone ? maskPhoneForLog(phone) : "(empty)";
  console.info("[meta-leads][validate] phone mapping:", {
    leadgenId,
    fieldNames: graph.field_data?.map((f) => f.name),
    phoneFieldFound: Boolean(parsed.rawPhone),
    phoneRawMasked,
    phoneNormMasked,
    phoneIsTestDummy: parsed.phoneIsTestDummy,
  });

  if (parsed.phoneIsTestDummy) {
    // Testing Tool 더미는 실번호가 아니므로 합성 번호로 UPSERT 허용 (운영 실리드는 기존 검증 유지)
    phone = syntheticTestPhoneFromLeadId(leadgenId);
    console.warn("[meta-leads][validate] meta test dummy phone — using synthetic:", {
      leadgenId,
      phoneMasked: maskPhoneForLog(phone),
    });
  } else if (phone.length < 10 || phone.length > 11) {
    console.error("[meta-leads][validate] invalid phone:", {
      leadgenId,
      phoneRawMasked,
      phoneNormMasked,
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
  const TABLE = "tylife_b2b" as const;

  const { data: existing, error: findErr } = await supabase
    .from(TABLE)
    .select("id")
    .eq("meta_lead_id", leadgenId)
    .maybeSingle();

  if (findErr) {
    logSupabaseError("lookup by meta_lead_id", findErr, { leadgenId, table: TABLE });
    if (/meta_lead_id|schema cache|column/i.test(findErr.message)) {
      return {
        ok: false,
        message: `Supabase 스키마 오류(meta_lead_id): ${findErr.message}. 마이그레이션 040을 적용하세요.`,
        status: 500,
        stage: "supabase",
      };
    }
    return { ok: false, message: findErr.message, status: 500, stage: "supabase" };
  }

  const sharedFields: Record<string, unknown> = {
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
    utm_campaign: campaignId,
    utm_content: adId,
    region: regionRaw,
    region_zone: resolveRegionZone(regionRaw),
    available_time: parsed.available_time,
    age_group: parsed.age_group,
    job: parsed.job,
    job_rank: parsed.job_rank,
  };

  if (existing?.id) {
    const { error: updErr } = await supabase
      .from(TABLE)
      .update(sharedFields)
      .eq("id", existing.id);

    if (updErr) {
      logSupabaseError("update existing candidate", updErr, { leadgenId, leadId: existing.id });
      return { ok: false, message: updErr.message, status: 500, stage: "supabase" };
    }
    console.info("[meta-leads][supabase] upsert update ok:", {
      table: TABLE,
      leadgenId,
      leadId: existing.id,
    });
    return { ok: true, created: false, leadId: String(existing.id) };
  }

  const insertRow: Record<string, unknown> = {
    ...sharedFields,
    meta_lead_id: leadgenId,
    entry_page: "/meta-lead-ads",
    status: "배정전",
    status_changed_at: nowIso,
    merge_status: "active",
    marketing_consent: 1,
  };
  if (metaCreated) insertRow.created_at = metaCreated;

  const { data: inserted, error: insErr } = await supabase
    .from(TABLE)
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr) {
    logSupabaseError("insert new candidate", insErr, { leadgenId });
    if (/duplicate|unique|meta_lead_id/i.test(insErr.message)) {
      const { data: again, error: againErr } = await supabase
        .from(TABLE)
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
  console.info("[meta-leads][supabase] insert ok:", {
    table: TABLE,
    leadgenId,
    leadId,
    phone: maskPhoneForLog(phone),
  });

  let assigned: { assigneeId: string; assigneeName: string } | null = null;
  try {
    assigned = await tryAutoAssignLead({
      table: TABLE,
      leadId,
      region: regionRaw,
      utmSource: "meta",
    });
  } catch (e) {
    console.warn("[meta-leads] auto-assign skipped:", e instanceof Error ? e.message : e);
  }

  try {
    await notifyAdminsNewLead({
      kind: "candidates",
      name,
      phone,
      leadId,
      region: regionRaw,
      assigneeName: assigned?.assigneeName ?? null,
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
